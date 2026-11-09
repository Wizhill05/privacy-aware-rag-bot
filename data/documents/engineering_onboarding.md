# Engineering Onboarding Guide & Architecture Standards

DEPARTMENTAL GUIDELINE - ENGINEERING DEPARTMENT ONLY.

## First Week Setup Checklist
1. **GitHub Organization**: Accept the invitation to github.com/acme-corp and setup SSH keys with FIDO2 hardware tokens.
2. **Local Development Environment**:
   - Install Node.js 22 LTS, Docker Desktop, and Git.
   - Run `git clone` on the primary monorepo and run `npm run setup`.
3. **AWS & Cloud Access**:
   - Request IAM Identity Center role via internal portal for the `engineering-sandbox` account.
   - Production access requires two peer approvals and manager sign-off.

## Architecture and Coding Standards
- Microservices use Node.js TypeScript with clean domain-driven architecture.
- All intra-service communication must be authenticated via mTLS and authorized with Auth0 FGA tokens.
- Observability: Every HTTP service must emit OpenTelemetry traces with standard span contexts.
- Code review: At least one senior engineer approval is required prior to main branch merge.
