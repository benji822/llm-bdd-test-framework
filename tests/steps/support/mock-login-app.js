const MOCK_FLAG = 'MOCK_LOGIN_APP';
const ROUTE_SYMBOL = Symbol('mock-login-app-installed');

export async function ensureMockLoginApp(page) {
  if (process.env[MOCK_FLAG] !== 'true') {
    return;
  }

  if (page[ROUTE_SYMBOL]) {
    return;
  }

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
  const targetOrigin = new URL(baseUrl).origin;
  const validEmail = process.env.E2E_USER_EMAIL ?? 'qa.user@example.com';
  const validPassword = process.env.E2E_USER_PASSWORD ?? 'SuperSecure123!';

  await page.route('**/*', async (route, request) => {
    await handleRoute(route, request.url(), targetOrigin, validEmail, validPassword);
  });

  page[ROUTE_SYMBOL] = true;
}

async function handleRoute(route, requestUrl, targetOrigin, email, password) {
  const url = new URL(requestUrl);
  if (url.origin !== targetOrigin) {
    await route.fallback();
    return;
  }

  if (url.pathname === '/login' || url.pathname === '/') {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: renderLoginHtml(email, password),
    });
    return;
  }

  if (url.pathname === '/dashboard') {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: renderDashboardHtml(),
    });
    return;
  }

  await route.fulfill({ status: 404, body: 'Not found' });
}

function renderLoginHtml(email, password) {
  const emailLiteral = JSON.stringify(email);
  const passwordLiteral = JSON.stringify(password);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock Login</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 420px; }
      main { padding: 2rem; border: 1px solid #dde1e7; border-radius: 12px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12); }
      label { display: block; margin-bottom: 1rem; color: #0f172a; font-weight: 600; }
      input { width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #cbd5f5; }
      button { margin-top: 0.5rem; width: 100%; padding: 0.75rem; border-radius: 6px; border: none; background: #2563eb; color: #fff; font-size: 1rem; cursor: pointer; }
      [hidden] { display: none !important; }
      .error { margin-top: 0.75rem; color: #b91c1c; font-weight: 600; }
    </style>
  </head>
  <body>
    <main data-testid="login-page">
      <h1>Sign in</h1>
      <form data-testid="login-form">
        <label>Email
          <input data-testid="email-input" type="email" autocomplete="username" required />
        </label>
        <label>Password
          <input data-testid="password-input" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" data-testid="submit-button" aria-label="Sign in">Sign in</button>
        <div role="alert" class="error" data-testid="login-error" hidden>Invalid credentials provided</div>
        <div class="error" data-testid="required-field-message" hidden>Please fill out this field.</div>
      </form>
    </main>
    <script>
      const VALID_EMAIL = ${emailLiteral};
      const VALID_PASSWORD = ${passwordLiteral};
      const errorBanner = document.querySelector('[data-testid="login-error"]');
      const requiredMessage = document.querySelector('[data-testid="required-field-message"]');
      document.querySelector('[data-testid="login-form"]').addEventListener('submit', (event) => {
        event.preventDefault();
        const emailInput = document.querySelector('[data-testid="email-input"]');
        const passwordInput = document.querySelector('[data-testid="password-input"]');
        const emailValue = emailInput.value.trim();
        const passwordValue = passwordInput.value.trim();
        requiredMessage.hidden = true;
        errorBanner.hidden = true;
        if (!emailValue || !passwordValue) {
          requiredMessage.textContent = 'Please fill out this field.';
          requiredMessage.hidden = false;
          return;
        }
        if (emailValue === VALID_EMAIL && passwordValue === VALID_PASSWORD) {
          window.location.href = '/dashboard';
          return;
        }
        errorBanner.textContent = 'Invalid credentials provided';
        errorBanner.hidden = false;
      });
    </script>
  </body>
</html>`;
}

function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 3rem; }
      h1 { color: #065f46; }
    </style>
  </head>
  <body>
    <h1 data-testid="dashboard-heading" aria-label="Welcome back">Welcome back</h1>
    <p>You have successfully authenticated via the mock login app.</p>
  </body>
</html>`;
}
