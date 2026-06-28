const targets = require("./targets.json");

module.exports = [
  {
    name: "main",
    appDir: "frontend-main/src/app",
    host: targets.mainHost,
    areaRole: {
      admin: "superadmin",
      dashboard: "superadmin",
      signup: "anon",
      pricing: "anon",
      demo: "anon",
      "(auth)": "anon",
      "": "anon",
    },
  },
  {
    name: "customer",
    appDir: "frontend-customer/src/app",
    host: targets.tenantHost,
    areaRole: {
      admin: "coach",
      "(student)": "student",
      "(public)": "anon",
      "(auth)": "anon",
      impersonate: "anon",
      live: "anon",
      "live-stream": "anon",
      "": "anon",
    },
  },
];
