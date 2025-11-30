# GitHub Actions Workflows

This directory contains CI/CD workflows for the Grapefruit project.

## Workflows

### 1. CI Pipeline (`ci.yml`)

**Purpose**: Comprehensive continuous integration pipeline

**Triggers**:
- Push to `main`, `develop`, or `feature/*` branches
- Pull requests to `main` or `develop`

**Jobs**:

#### Backend Tests
- Sets up PostgreSQL 15 service
- Installs Node.js dependencies
- Initializes database schema and seed data
- Runs full test suite with coverage
- Uploads coverage reports to Codecov

#### Linting
- Runs ESLint on backend code
- Continues on warnings (non-blocking)

#### Docker Build Test
- Validates Dockerfile syntax
- Builds backend container image
- Uses GitHub Actions cache for speed

#### Integration Test
- Starts full docker-compose stack
- Tests API health endpoint
- Validates inventory endpoint
- Ensures service communication works

**Runtime**: ~5-7 minutes

---

### 2. Test Coverage (`test-coverage.yml`)

**Purpose**: Generate and report code coverage metrics

**Triggers**:
- Push to `main` or `develop`
- Pull requests to `main`

**Jobs**:

#### Coverage Generation
- Runs tests with detailed coverage
- Generates LCOV reports
- Uploads to Codecov
- Comments coverage diff on pull requests

**Runtime**: ~3-4 minutes

---

## Setup Instructions

### 1. GitHub Repository Setup

No additional configuration required! Workflows run automatically when code is pushed.

### 2. Optional Secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `ENCRYPTION_KEY` | No | 32-byte hex string for data encryption (auto-generated if missing) |

To generate an encryption key:
```bash
openssl rand -hex 32
```

### 3. Codecov Integration (Optional)

For detailed coverage reports:

1. Sign up at [codecov.io](https://codecov.io)
2. Connect your GitHub repository
3. No secret needed (Codecov detects uploads automatically)

---

## Viewing Results

### GitHub Actions UI

1. Go to **Actions** tab in repository
2. Select workflow run
3. View job logs and test results

### Pull Request Checks

- Status checks appear on PR page
- Coverage diff shows in PR comments (if Codecov configured)
- Red ❌ = failed, Green ✅ = passed

### Codecov Dashboard

- Visit `https://codecov.io/gh/esemsc-as4623/grapefruit`
- View coverage trends over time
- Identify uncovered code

---

## Local Testing Before Push

Run the same checks locally:

```bash
# Backend tests
cd backend
npm test

# Linting
npm run lint

# Docker build
cd ..
docker build -t grapefruit-backend ./backend

# Full integration test
docker-compose up -d
curl http://localhost:5000/health
docker-compose down
```

---

## Troubleshooting

### Workflow Fails on Database Setup

**Issue**: PostgreSQL service not ready

**Solution**: GitHub Actions includes health checks - this shouldn't happen. If it does:
- Check workflow logs
- Verify `database/init.sql` syntax
- Test locally first

### Docker Build Fails

**Issue**: Dockerfile syntax or missing files

**Solution**:
```bash
# Test locally
docker build -t test ./backend

# Check Dockerfile
cat backend/Dockerfile
```

### Tests Pass Locally But Fail in CI

**Possible causes**:
1. **Environment differences**: Check `NODE_ENV` and other env vars
2. **Database state**: CI starts fresh each time
3. **Timing issues**: Network latency in CI environment
4. **Missing dependencies**: Check `package-lock.json` is committed

**Debug steps**:
1. Check GitHub Actions logs
2. Compare environment variables
3. Run with `NODE_ENV=test` locally
4. Check for hardcoded paths or timestamps

---

## Modifying Workflows

### Adding New Tests

Edit `ci.yml`:

```yaml
- name: Run new test suite
  working-directory: ./backend
  run: npm run test:new-suite
```

### Changing Node.js Version

Update in both workflows:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # Change version here
```

### Adding New Services

Add to `services:` section in `ci.yml`:

```yaml
services:
  postgres:
    # ... existing config
  
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
```

---

## Best Practices

### 1. Keep Workflows Fast
- Use caching for dependencies
- Run heavy jobs in parallel
- Skip unnecessary steps

### 2. Fail Fast
- Run tests before build
- Use `continue-on-error: false` for critical jobs

### 3. Clear Logging
- Use descriptive job/step names
- Output useful debug info on failure

### 4. Security
- Never commit secrets to workflow files
- Use GitHub Secrets for sensitive data
- Limit token permissions

---

## Workflow Status Badges

Add to README.md:

```markdown
![CI Pipeline](https://github.com/esemsc-as4623/grapefruit/actions/workflows/ci.yml/badge.svg)
![Coverage](https://codecov.io/gh/esemsc-as4623/grapefruit/branch/main/graph/badge.svg)
```

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [PostgreSQL Service](https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers)
- [Codecov GitHub Action](https://github.com/codecov/codecov-action)

---

## Maintenance

### Regular Tasks

- [ ] Review failed workflow runs weekly
- [ ] Update action versions quarterly
- [ ] Monitor CI execution time
- [ ] Clean up old workflow runs (automatic after 90 days)

### When to Update

- New Node.js LTS version released
- Breaking changes in dependencies
- New test suites added
- Service version upgrades (PostgreSQL, etc.)

---

**Last Updated**: 2025-11-30  
**Maintained By**: Grapefruit Development Team
