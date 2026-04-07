# Troubleshooting & Roadmap

## Troubleshooting

**"Dispositivo nao configurado"**:
- Device setup not completed or IndexedDB cleared
- Solution: Navigate to `/setup` and reconfigure

**Login fails offline**:
- Staff not cached locally (first login must be online)
- Solution: Connect to internet and login once

**Visits not syncing**:
- Backend health score = 0 (check console logs)
- Solution: Verify network, check Supabase status, restart app

**Camera not working**:
- HTTPS required for camera access
- Solution: Ensure dev server uses `https://` (vite.config.ts has basicSsl plugin)

**Audio alerts not playing**:
- Browser blocked audio without user interaction
- Solution: Click "Test Sound" button to grant permission

**Admin access**:
- Secret access: Tap logo 5 times on login screen
- Admin PIN: 123456 (for emergency device configuration)

**Device Config Issues**:
- **Setup screen reappears**: localStorage cleared → app recovers from IndexedDB or Central DB
- **"Condominium already assigned"**: Another active device exists → admin deactivates old device
- **Offline config doesn't sync**: Device record missing in Central DB → admin creates it manually
- **device_identifier changed after reinstall**: Browser data cleared, new UUID generated → admin updates Central DB or reconfigures
- **IndexedDB cleared unexpectedly**: Persistent storage not granted → check `navigator.storage.persisted()`, recover from localStorage backup

**PWA Issues**:
- **Debugging PWA Updates**:
  1. DevTools → Application → Service Workers (check status)
  2. Console logs with `[PWA Update]` prefix
  3. Force update: DevTools → Application → Service Workers → "Update" or "Unregister" + refresh
  4. Network tab: filter by "sw.js", verify 200 response (not 304)

- **Installing on Tablets**:
  - **Android**: Chrome/Edge → Menu → "Install app" or "Add to Home Screen"
  - **iOS/iPadOS**: Safari → Share button → "Add to Home Screen"
  - Recommended: disable screen auto-lock, enable "stay awake while charging", set portrait orientation

---

## Future Roadmap

### Features
- [ ] Push notifications for residents (visit approval)
- [ ] QR Code for recurring visitors
- [ ] Facial biometrics for identification
- [ ] IP camera integration
- [x] Visit history export (CSV/PDF) - *Implemented in utils/csvExport.ts*
- [ ] Vehicle & parking management
- [ ] Internal guard chat

### Technical
- [ ] Complete PWA with Background Sync API
- [ ] E2E encryption for sensitive data
- [ ] Multi-language support (i18n)
- [ ] Automated testing (Jest + Testing Library)
- [ ] CI/CD pipeline
- [x] Error monitoring (Sentry) - *Implemented in config/sentry.ts + services/logger.ts*
- [x] ESLint configuration - *Implemented in eslint.config.js*
