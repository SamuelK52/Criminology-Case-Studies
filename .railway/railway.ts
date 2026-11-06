import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "web";
export default defineRailway(() => {
  const web = service("web", {
    source: github("SamuelK52/Criminology-Case-Studies"),
    build: { buildCommand: "npm run build", buildEnvironment: "V3", builder: "RAILPACK" },
    start: "npm run start",
    healthcheck: "/",
    healthcheckTimeout: 120,
    preDeploy: "npm run db:setup",
    replicas: { "sfo": 1 },
  });

  return project("caselab", {
    variables: { managed: false },
    resources: [web],
  });
});
