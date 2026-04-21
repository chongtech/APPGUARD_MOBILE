const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SQL_PATH = path.join(ROOT, "database", "migrations", "all.sql");
const CANONICAL_RPC_START = "-- BEGIN CANONICAL RPC CATALOG";
const CANONICAL_RPC_END = "-- END CANONICAL RPC CATALOG";
const ALLOWED_RPC_FILE = path.normalize(path.join("lib", "data", "rpc.ts"));
const SCAN_DIRS = [
  "components",
  "config",
  "constants",
  "contexts",
  "hooks",
  "lib",
  "navigation",
  "screens",
  "scripts",
  "services",
  "utils",
];
const SCAN_FILES = ["App.tsx", "index.js"];
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function splitTopLevel(input, separator) {
  const parts = [];
  let start = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depthParen += 1;
    else if (char === ")") depthParen -= 1;
    else if (char === "{") depthBrace += 1;
    else if (char === "}") depthBrace -= 1;
    else if (char === "[") depthBracket += 1;
    else if (char === "]") depthBracket -= 1;
    else if (
      char === separator &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(input.slice(start));
  return parts;
}

function getLine(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function parseSqlArgs(argList) {
  const trimmed = argList.trim();
  if (!trimmed) return [];

  return splitTopLevel(trimmed, ",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name] = part.split(/\s+/);
      return {
        name,
        required: !/\bDEFAULT\b/i.test(part),
      };
    });
}

function parseSqlCatalog() {
  const sqlFile = readFile(SQL_PATH);
  const startIndex = sqlFile.indexOf(CANONICAL_RPC_START);
  const endIndex = sqlFile.indexOf(CANONICAL_RPC_END);
  const sql =
    startIndex !== -1 && endIndex !== -1 && endIndex > startIndex
      ? sqlFile.slice(startIndex + CANONICAL_RPC_START.length, endIndex)
      : sqlFile;
  const lines = sql.split(/\r?\n/);
  const functions = new Map();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const match = line.match(
      /^CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)\((.*)\)$/i,
    );
    if (!match) continue;

    const [, name, argList] = match;
    const signature = {
      name,
      params: parseSqlArgs(argList),
      line: i + 1,
    };

    if (!functions.has(name)) {
      functions.set(name, []);
    }
    functions.get(name).push(signature);
  }

  return functions;
}

function collectCodeFiles() {
  const files = [];

  for (const file of SCAN_FILES) {
    const absolute = path.join(ROOT, file);
    if (fs.existsSync(absolute)) files.push(absolute);
  }

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".expo"
      ) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name === "verify-rpc-signatures.js") {
        continue;
      }
      if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir));
  }

  return files;
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function parseObjectKeys(objectLiteral) {
  const trimmed = objectLiteral.trim();
  if (trimmed === "{}") {
    return { keys: [], needsManualReview: false };
  }
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { keys: [], needsManualReview: true };
  }

  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return { keys: [], needsManualReview: false };
  }

  const entries = splitTopLevel(body, ",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const keys = [];

  for (const entry of entries) {
    if (entry.startsWith("...")) {
      return { keys: [], needsManualReview: true };
    }

    const colonIndex = (() => {
      let depthParen = 0;
      let depthBrace = 0;
      let depthBracket = 0;
      let quote = null;
      let escaped = false;

      for (let i = 0; i < entry.length; i += 1) {
        const char = entry[i];
        if (quote) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === "\\") {
            escaped = true;
            continue;
          }
          if (char === quote) {
            quote = null;
          }
          continue;
        }

        if (char === "'" || char === '"' || char === "`") {
          quote = char;
          continue;
        }
        if (char === "(") depthParen += 1;
        else if (char === ")") depthParen -= 1;
        else if (char === "{") depthBrace += 1;
        else if (char === "}") depthBrace -= 1;
        else if (char === "[") depthBracket += 1;
        else if (char === "]") depthBracket -= 1;
        else if (
          char === ":" &&
          depthParen === 0 &&
          depthBrace === 0 &&
          depthBracket === 0
        ) {
          return i;
        }
      }

      return -1;
    })();

    if (colonIndex === -1) {
      return { keys: [], needsManualReview: true };
    }

    const rawKey = entry.slice(0, colonIndex).trim();
    if (!/^[$A-Z_][0-9A-Z_$]*$/i.test(rawKey)) {
      return { keys: [], needsManualReview: true };
    }
    keys.push(rawKey);
  }

  return { keys, needsManualReview: false };
}

function parseCallExpressions(source, filePath) {
  const calls = [];
  const patterns = [
    { kind: "callRpc", regex: /\bcallRpc(?:First)?(?:<[^>]*>)?\s*\(/g },
    { kind: "rpc", regex: /\.rpc\s*\(/g },
  ];

  for (const { kind, regex } of patterns) {
    let match;
    while ((match = regex.exec(source)) !== null) {
      const openParenIndex = source.indexOf("(", match.index);
      const closeParenIndex = findMatchingParen(source, openParenIndex);
      if (closeParenIndex === -1) continue;

      const argsSource = source.slice(openParenIndex + 1, closeParenIndex);
      const args = splitTopLevel(argsSource, ",").map((arg) => arg.trim());
      const nameArg = args[0] ?? "";
      const paramsArg = args[1] ?? "";
      const nameMatch =
        nameArg.match(/^"([^"]+)"$/) || nameArg.match(/^'([^']+)'$/);

      const parsed = {
        filePath,
        line: getLine(source, match.index),
        kind,
        name: nameMatch ? nameMatch[1] : null,
        paramsArg,
        manualReview: false,
        keys: [],
      };

      if (kind === "rpc") {
        calls.push(parsed);
        continue;
      }

      if (!parsed.name) {
        parsed.manualReview = true;
        calls.push(parsed);
        continue;
      }

      if (!paramsArg) {
        calls.push(parsed);
        continue;
      }

      const objectInfo = parseObjectKeys(paramsArg);
      parsed.keys = objectInfo.keys;
      parsed.manualReview = objectInfo.needsManualReview;
      calls.push(parsed);
    }
  }

  return calls;
}

function formatLocation(filePath, line) {
  const relative = path.relative(ROOT, filePath);
  return `${relative}:${line}`;
}

function main() {
  const catalog = parseSqlCatalog();
  const files = collectCodeFiles();
  const calls = files.flatMap((filePath) =>
    parseCallExpressions(readFile(filePath), filePath),
  );
  const errors = [];
  const reviews = [];

  for (const [name, signatures] of catalog.entries()) {
    if (signatures.length > 1) {
      const lines = signatures.map((signature) => signature.line).join(", ");
      errors.push(`Overloaded RPC in all.sql: ${name} (lines ${lines})`);
    }
  }

  for (const call of calls) {
    const relativePath = path.relative(ROOT, call.filePath);
    const normalizedPath = path.normalize(relativePath);

    if (call.kind === "rpc") {
      if (normalizedPath !== ALLOWED_RPC_FILE) {
        errors.push(
          `Direct .rpc() outside lib/data/rpc.ts at ${formatLocation(
            call.filePath,
            call.line,
          )}`,
        );
      }
      continue;
    }

    if (normalizedPath === ALLOWED_RPC_FILE) {
      continue;
    }

    if (!call.name) {
      reviews.push(
        `Manual review needed at ${formatLocation(
          call.filePath,
          call.line,
        )}: dynamic RPC name`,
      );
      continue;
    }

    if (!catalog.has(call.name)) {
      errors.push(
        `Unknown RPC ${call.name} at ${formatLocation(call.filePath, call.line)}`,
      );
      continue;
    }

    if (call.manualReview) {
      reviews.push(
        `Manual review needed for ${call.name} at ${formatLocation(
          call.filePath,
          call.line,
        )}: dynamic or non-literal params`,
      );
      continue;
    }

    const signature = catalog.get(call.name)[0];
    const allowedKeys = new Set(signature.params.map((param) => param.name));
    const requiredKeys = signature.params
      .filter((param) => param.required)
      .map((param) => param.name);

    for (const key of call.keys) {
      if (!allowedKeys.has(key)) {
        errors.push(
          `Unexpected param ${key} for ${call.name} at ${formatLocation(
            call.filePath,
            call.line,
          )}`,
        );
      }
    }

    for (const key of requiredKeys) {
      if (!call.keys.includes(key)) {
        errors.push(
          `Missing required param ${key} for ${call.name} at ${formatLocation(
            call.filePath,
            call.line,
          )}`,
        );
      }
    }
  }

  if (errors.length === 0 && reviews.length === 0) {
    console.log("RPC signature check passed with zero issues.");
    return;
  }

  if (errors.length > 0) {
    console.error("RPC contract errors:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
  }

  if (reviews.length > 0) {
    console.error("RPC manual review:");
    for (const review of reviews) {
      console.error(`- ${review}`);
    }
  }

  process.exitCode = 1;
}

main();
