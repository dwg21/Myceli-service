const SENSITIVE_PATH_PATTERNS = [
  /^\/\.env(?:$|[/.])/i,
  /^\/\.git(?:$|[/.])/i,
  /^\/config(?:$|[/.])/i,
  /^\/\.svn(?:$|[/.])/i,
  /^\/\.hg(?:$|[/.])/i,
  /^\/\.aws(?:$|[/.])/i,
  /^\/wp-admin(?:$|[/.])/i,
  /^\/wp-login\.php$/i,
  /^\/xmlrpc\.php$/i,
  /^\/server-status$/i,
];

const SUSPICIOUS_UA_PATTERNS = [
  /python-requests/i,
  /python-httpx/i,
  /aiohttp/i,
  /scrapy/i,
  /curl\//i,
  /wget/i,
  /go-http-client/i,
  /httpclient/i,
  /libwww-perl/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /headlesschrome/i,
  /puppeteer/i,
  /playwright/i,
];

const hasSuspiciousPath = (path = "") =>
  SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));

const hasSuspiciousUserAgent = (ua = "") =>
  SUSPICIOUS_UA_PATTERNS.some((pattern) => pattern.test(ua));

export const applySecurityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
};

export const blockSensitivePathProbes = (req, res, next) => {
  if (hasSuspiciousPath(req.path || req.originalUrl || "")) {
    return res.status(404).json({ error: "Not found" });
  }
  return next();
};

export const blockObviousBotUserAgents = (req, res, next) => {
  if (req.path === "/health") return next();
  const ua = req.get("user-agent") || "";
  if (ua && hasSuspiciousUserAgent(ua)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};
