# ENTRYFLOW - PENETRATION TEST REPORT

**Assessment Date:** 2026-01-22
**Assessment Type:** White-box Source Code Review
**Application:** EntryFlow PWA
**Version:** 0.0.0 (Alpha)

---

## Executive Summary

The EntryFlow application is a PWA for condominium gate management with significant security vulnerabilities. The assessment identified **15 security issues** ranging from Critical to Low severity. The most concerning findings involve **hardcoded credentials**, **client-side authentication bypass possibilities**, **sensitive data exposure in client storage**, and **insufficient authorization controls**.

**Overall Security Posture: MEDIUM-HIGH RISK**

---

## Scope

**Stack Analyzed:**
- React 19 + TypeScript
- Vite 6
- Dexie.js (IndexedDB)
- Supabase (PostgreSQL backend)
- Tailwind CSS

**Key Files Reviewed:**
- `services/dataService.ts` (1,949 lines)
- `services/Supabase.ts` (2,146 lines)
- `App.tsx` (462 lines)
- `pages/Login.tsx`
- `pages/Setup.tsx`
- `services/deviceUtils.ts`
- `services/supabaseClient.ts`
- `components/AdminRoute.tsx`

---

## Vulnerability Findings

### CRITICAL SEVERITY

---

#### 1. Hardcoded Admin PIN (CWE-798)
**CVSS Score: 9.8 (Critical)**

**Location:** `pages/Login.tsx:47`

**Evidence:**
```typescript
const confirmReset = async () => {
    if (adminPin === '123456') {  // HARDCODED CREDENTIAL
       await api.resetDevice();
    } else {
       alert("Codigo Invalido");
       setAdminPin('');
    }
};
```

**Description:** The admin PIN `123456` is hardcoded in client-side JavaScript. Any attacker can view the source code (via browser DevTools) and discover this PIN, allowing them to reset any device configuration.

**Impact:** Complete device takeover, ability to reset and reconfigure any tablet to any condominium.

**Remediation:**
- Remove hardcoded PIN from client code
- Implement server-side PIN verification via Supabase RPC
- Use time-limited, rotating PINs generated on the backend

---

#### 2. PIN Hash Exposure in IndexedDB (CWE-312)
**CVSS Score: 8.6 (High)**

**Location:** `services/dataService.ts:582-588`

**Evidence:**
```typescript
private async syncStaff(condoId: number) {
    if (!this.isBackendHealthy) return;
    try {
      const staffList = await SupabaseService.getStaffForSync(condoId);
      await db.staff.bulkPut(staffList);  // Stores pin_hash in IndexedDB
      ...
    }
}
```

**Location:** `services/Supabase.ts:209-223`

**Evidence:**
```typescript
async getStaffForSync(condoId: number): Promise<Staff[]> {
    ...
    const { data, error } = await supabase
        .from('staff')
        .select('*')  // Includes pin_hash column!
        .eq('condominium_id', condoId);
    ...
}
```

**Description:** Staff PIN hashes (bcrypt) are synced to IndexedDB and remain accessible in the browser. While bcrypt is resistant to brute force, this still exposes credential material. An attacker with physical access to the device can extract the hashes and attempt offline cracking, especially for weak 4-6 digit PINs.

**Impact:** Credential theft, offline brute-force attacks on PIN hashes.

**Remediation:**
- Do not sync pin_hash to client devices
- Perform all PIN verification server-side only
- If offline auth is required, use a separate offline token with limited validity

---

### HIGH SEVERITY

---

#### 3. Client-Side Role Enforcement (CWE-602)
**CVSS Score: 7.5 (High)**

**Location:** `components/AdminRoute.tsx:29`

**Evidence:**
```typescript
if (user.role !== UserRole.ADMIN) {
    return (
      <div className="...">
        ...Access Denied UI...
      </div>
    );
}
```

**Location:** `App.tsx:366-376`

**Evidence:**
```typescript
const login = (staff: Staff) => {
    setUser(staff);
    localStorage.setItem('auth_user', JSON.stringify(staff));  // Role stored in localStorage
};
```

**Description:** Admin role enforcement is performed client-side only. The user object (including role) is stored in localStorage and can be modified via browser DevTools:

```javascript
// Attack: Elevate privileges
localStorage.setItem('auth_user', JSON.stringify({...existingUser, role: 'ADMIN'}));
location.reload();
```

While admin API calls may still require backend authorization, the client UI access control is bypassable.

**Impact:** Unauthorized access to admin UI, potential access to sensitive data displayed in admin pages.

**Remediation:**
- Implement Row Level Security (RLS) in Supabase
- Add server-side role verification for all admin RPC calls
- Include JWT tokens with role claims signed by backend

---

#### 4. Secret Admin Access via Easter Egg (CWE-912)
**CVSS Score: 7.2 (High)**

**Location:** `pages/Login.tsx:35-53`

**Evidence:**
```typescript
const handleSecretTap = () => {
    setTapCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowAdminModal(true);  // Shows reset modal after 5 taps
        return 0;
      }
      return newCount;
    });
};
```

**Description:** A hidden feature is triggered by tapping the logo 5 times on the login screen. This reveals a device reset modal that accepts the hardcoded PIN `123456`. This "security through obscurity" approach is easily discovered.

**Impact:** Combined with Finding #1, allows complete device reset by any user who reads documentation or discovers the feature.

**Remediation:**
- Remove the hidden easter egg feature
- Require proper authentication for device reset
- Implement device reset only through backend admin panel

---

#### 5. Sensitive Data in localStorage (CWE-922)
**CVSS Score: 7.0 (High)**

**Location:** `App.tsx:369`

**Evidence:**
```typescript
localStorage.setItem('auth_user', JSON.stringify(staff));
```

**Location:** `services/dataService.ts:414-415`

**Evidence:**
```typescript
localStorage.setItem('condo_guard_device_id', deviceId);
localStorage.setItem('device_condo_backup', JSON.stringify(condo));
```

**Description:** Multiple sensitive items are stored in localStorage:
- Complete staff object including role and ID
- Device identifier
- Condominium configuration

localStorage is accessible via JavaScript, making it vulnerable to XSS attacks.

**Impact:** Session hijacking, impersonation, data leakage through XSS.

**Remediation:**
- Use HttpOnly cookies for authentication tokens
- Encrypt sensitive localStorage data
- Implement Content Security Policy to mitigate XSS

---

#### 6. API Keys Exposed in Client Bundle (CWE-798)
**CVSS Score: 6.5 (Medium-High)**

**Location:** `services/supabaseClient.ts:4-5`

**Evidence:**
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

**Location:** `services/dataService.ts:59`

**Evidence:**
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nfuglaftnaohzacilike.supabase.co';
```

**Description:**
- Supabase anon key is bundled into client JavaScript (visible in built output)
- A hardcoded fallback Supabase URL exists in the code
- VITE_GEMINI_API_KEY for AI service is also client-exposed

While Supabase anon keys are designed for client use with RLS, the Gemini API key should not be exposed.

**Impact:**
- API abuse (Gemini API quota exhaustion)
- Data enumeration if RLS is misconfigured

**Remediation:**
- Proxy Gemini API calls through backend
- Implement proper RLS policies in Supabase
- Rate limit API access per device

---

### MEDIUM SEVERITY

---

#### 7. Insufficient Input Validation (CWE-20)
**CVSS Score: 5.4 (Medium)**

**Location:** `services/Supabase.ts:281-308`

**Evidence:**
```typescript
async createVisit(visit: any): Promise<Visit | null> {
    ...
    const cleanedPayload = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        key,
        value === '' ? null : value  // Minimal sanitization
      ])
    );
    ...
    const { data, error } = await supabase
        .from('visits')
        .insert(cleanedPayload)  // Direct insertion
```

**Description:** User input from visit forms is minimally validated before database insertion. While Supabase provides some SQL injection protection, the application lacks:
- Field length validation
- Format validation for phone numbers, documents
- HTML/script tag sanitization

**Impact:** Potential for stored XSS if data is rendered unsafely, data integrity issues.

**Remediation:**
- Implement comprehensive input validation on client and server
- Use parameterized queries (already done by Supabase SDK)
- Sanitize all output when rendering user data

---

#### 8. Weak Device Fingerprinting (CWE-330)
**CVSS Score: 5.3 (Medium)**

**Location:** `services/deviceUtils.ts:11-17`

**Evidence:**
```typescript
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;  // Uses Math.random()
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

**Description:** Device identifiers are generated using `Math.random()`, which is not cryptographically secure. The identifier is also stored only in localStorage, which can be:
- Easily copied to another device
- Cleared by the browser
- Manipulated by an attacker

**Impact:** Device impersonation, audit trail manipulation.

**Remediation:**
- Use `crypto.getRandomValues()` for UUID generation
- Implement multiple fingerprinting factors (canvas, WebGL, etc.)
- Bind device identity to hardware-backed storage where available

---

#### 9. Offline Authentication Bypass Risk (CWE-287)
**CVSS Score: 5.0 (Medium)**

**Location:** `services/dataService.ts:591-623`

**Evidence:**
```typescript
async login(firstName: string, lastName: string, pin: string): Promise<Staff | null> {
    ...
    // --- OFFLINE FALLBACK ---
    const localStaff = await db.staff.where({ first_name: firstName, last_name: lastName }).first();
    if (localStaff?.pin_hash) {
      const isValid = await bcrypt.compare(pin, localStaff.pin_hash);
      if (isValid) {
        console.warn("Login OFFLINE bem-sucedido.");
        return localStaff;
      }
    }
}
```

**Description:** Offline authentication relies on cached staff data with PIN hashes. An attacker could:
1. Compromise the IndexedDB (via XSS or physical access)
2. Insert a staff record with a known PIN hash
3. Disconnect from network and authenticate

**Impact:** Unauthorized access when offline, audit trail manipulation.

**Remediation:**
- Sign cached credentials with a device-specific key
- Limit offline authentication validity period
- Require periodic online re-authentication

---

#### 10. Insecure Direct Object Reference in Admin Functions (CWE-639)
**CVSS Score: 5.0 (Medium)**

**Location:** `services/Supabase.ts:993-1010`

**Evidence:**
```typescript
async adminUpdateDevice(id: string, updates: Partial<Device>): Promise<Device | null> {
    ...
    const { data, error } = await supabase
        .from('devices')
        .update(updates)
        .eq('id', id)  // No authorization check
        .select()
        .single();
}
```

**Description:** Admin CRUD operations pass IDs directly to Supabase without server-side ownership verification. If RLS is not properly configured, any authenticated user could potentially modify records by manipulating API calls.

**Impact:** Unauthorized data modification, privilege escalation.

**Remediation:**
- Implement comprehensive RLS policies in Supabase
- Add server-side authorization checks in RPC functions
- Log all admin actions with actor verification

---

### LOW SEVERITY

---

#### 11. Session Persistence Without Expiration (CWE-613)
**CVSS Score: 4.0 (Low)**

**Location:** `App.tsx:378-390`

**Evidence:**
```typescript
// Restore auth state from localStorage (survives PWA updates)
const storedUser = localStorage.getItem('auth_user');
if (storedUser) {
  try {
    const parsedUser = JSON.parse(storedUser) as Staff;
    setUser(parsedUser);  // No expiration check
  }
```

**Description:** Authentication sessions persist indefinitely in localStorage with no expiration timestamp or validation.

**Impact:** Stale credentials remain valid, terminated staff may retain access.

**Remediation:**
- Add session expiration timestamps
- Implement periodic session validation against backend
- Add logout-all-devices capability

---

#### 12. Verbose Error Messages (CWE-209)
**CVSS Score: 3.7 (Low)**

**Location:** Multiple locations in `dataService.ts` and `Supabase.ts`

**Evidence:**
```typescript
console.error('[Admin] Error fetching visits via RPC:', {
    message: err.message,
    details: err.details,
    hint: err.hint,
    code: err.code,
    fullError: err
});
```

**Description:** Detailed error messages are logged to the console, potentially exposing database structure, query details, and internal error codes.

**Impact:** Information disclosure aiding further attacks.

**Remediation:**
- Remove detailed error logging in production
- Implement generic user-facing error messages
- Log detailed errors server-side only

---

#### 13. Missing Content Security Policy (CWE-1021)
**CVSS Score: 3.5 (Low)**

**Location:** Application-wide

**Description:** No Content Security Policy headers were observed. The application loads external resources (images from Unsplash in Login.tsx) without CSP restrictions.

**Impact:** Increased XSS attack surface.

**Remediation:**
- Implement strict CSP headers
- Use nonce-based script loading
- Restrict image sources to trusted domains

---

#### 14. Device Metadata Collection Privacy Risk (CWE-359)
**CVSS Score: 3.0 (Low)**

**Location:** `services/deviceUtils.ts:42-52`

**Evidence:**
```typescript
export function getDeviceMetadata(): any {
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: new Date().toISOString()
    };
}
```

**Description:** Device metadata is collected and sent to the backend. This may have privacy implications depending on jurisdiction (GDPR, etc.).

**Impact:** Privacy compliance risk.

**Remediation:**
- Document data collection in privacy policy
- Minimize collected data
- Implement data retention policies

---

#### 15. Supabase Auth Disabled (CWE-306)
**CVSS Score: 3.0 (Low)**

**Location:** `services/supabaseClient.ts:16-18`

**Evidence:**
```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      ...
      auth: {
        persistSession: false  // Auth disabled
      }
    });
```

**Description:** Supabase's built-in authentication is disabled. The application uses a custom PIN-based auth system instead of Supabase Auth, missing out on JWT-based session management and RLS integration.

**Impact:** Reduced security features, manual session management required.

**Remediation:**
- Consider using Supabase Auth for stronger session management
- If custom auth is required, integrate with Supabase JWT verification
- Ensure RLS policies work with the custom auth approach

---

## Summary Table

| # | Vulnerability | Severity | CVSS | File | Line |
|---|---------------|----------|------|------|------|
| 1 | Hardcoded Admin PIN | Critical | 9.8 | Login.tsx | 47 |
| 2 | PIN Hash Exposure in IndexedDB | High | 8.6 | dataService.ts | 582-588 |
| 3 | Client-Side Role Enforcement | High | 7.5 | AdminRoute.tsx | 29 |
| 4 | Secret Admin Access Easter Egg | High | 7.2 | Login.tsx | 35-53 |
| 5 | Sensitive Data in localStorage | High | 7.0 | App.tsx | 369 |
| 6 | API Keys Exposed in Client | Medium-High | 6.5 | supabaseClient.ts | 4-5 |
| 7 | Insufficient Input Validation | Medium | 5.4 | Supabase.ts | 281-308 |
| 8 | Weak Device Fingerprinting | Medium | 5.3 | deviceUtils.ts | 11-17 |
| 9 | Offline Authentication Bypass Risk | Medium | 5.0 | dataService.ts | 591-623 |
| 10 | IDOR in Admin Functions | Medium | 5.0 | Supabase.ts | 993-1010 |
| 11 | Session Persistence No Expiration | Low | 4.0 | App.tsx | 378-390 |
| 12 | Verbose Error Messages | Low | 3.7 | Multiple | Multiple |
| 13 | Missing Content Security Policy | Low | 3.5 | Application-wide | N/A |
| 14 | Device Metadata Privacy | Low | 3.0 | deviceUtils.ts | 42-52 |
| 15 | Supabase Auth Disabled | Low | 3.0 | supabaseClient.ts | 16-18 |

---

## Remediation Roadmap

### Immediate (0-7 days)
1. **Remove hardcoded admin PIN** from Login.tsx
2. **Stop syncing pin_hash** to client - modify getStaffForSync to exclude
3. **Implement server-side role verification** for admin RPC functions

### Short-term (1-4 weeks)
4. Configure **Supabase Row Level Security (RLS)** policies
5. **Proxy AI API calls** through backend to hide Gemini key
6. Add **session expiration** and validation
7. Implement **Content Security Policy** headers

### Medium-term (1-3 months)
8. Use **crypto.getRandomValues()** for device UUID generation
9. Add **comprehensive input validation** on all forms
10. Implement **signed offline credentials** with expiration
11. **Audit log all admin actions** with server-side verification

### Long-term (3-6 months)
12. Consider migrating to **Supabase Auth** with JWT
13. Implement **device attestation** for stronger device binding
14. Add **penetration testing** to CI/CD pipeline
15. Conduct **privacy impact assessment** for GDPR compliance

---

## Files Requiring Changes

| File Path | Changes Required |
|-----------|------------------|
| `pages/Login.tsx` | Remove hardcoded PIN, remove easter egg |
| `services/dataService.ts` | Remove pin_hash sync, add session expiration |
| `services/Supabase.ts` | Add input validation, modify staff sync query |
| `App.tsx` | Add session expiration logic, secure storage |
| `services/deviceUtils.ts` | Use crypto.getRandomValues() |
| `services/supabaseClient.ts` | Consider enabling Supabase Auth |
| `components/AdminRoute.tsx` | Add backend role verification |
| **Backend (Supabase)** | Implement RLS policies, secure RPC functions |

**Total: 8 files**

---

## Conclusion

The EntryFlow application has a functional offline-first architecture but contains several security vulnerabilities that should be addressed before production deployment. The most critical issues (hardcoded credentials, exposed PIN hashes) require immediate remediation. The application would benefit significantly from implementing proper backend authorization (Supabase RLS) and removing security-sensitive logic from client-side code.

---

**Report Generated:** 2026-01-22
**Methodology:** OWASP Testing Guide, CWE/CVSS Scoring
**Classification:** Internal Use Only
