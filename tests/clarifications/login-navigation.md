# Clarifications: login-navigation

## Question 1

**Source**: "Forgot your password?" link
**Q**: What is the exact text/translation key for the forgot password link?
**Why it matters**: Test needs to locate the link by text.
**A**: Translation key is `FORGOT_YOUR_PASSWORD`, typically displays "Forgot your password?"
**Required**: Yes

## Question 2

**Source**: "Reset password modal opens"
**Q**: How can the test verify that the reset password modal is open?
**Why it matters**: Need assertion criteria for modal state.
**A**: Modal store state changes to `modal: 'resetPassword'`
**Required**: Yes

## Question 3

**Source**: "Sign up" link
**Q**: What is the exact text for the sign up prompt and link?
**Why it matters**: Test needs to locate and click the correct link.
**A**: Prompt: `DONT_HAVE_AN_ACCOUNT` ("Don't have an account?"), Link: `SIGN_UP` ("Sign up")
**Required**: Yes

## Question 4

**Source**: "Redirect after login" scenario
**Q**: How is the redirect path parameter passed to the login page?
**Why it matters**: Test needs to construct correct URL with redirect parameter.
**A**: Via query parameter `redirectPath` (e.g., `/login?redirectPath=/games`)
**Required**: Yes

## Question 5

**Source**: "System redirects to intended destination"
**Q**: Does the system use push or replace for navigation?
**Why it matters**: Affects browser history and back button behavior in tests.
**A**: Uses `router.replace()` for redirects (not push) to avoid back-button issues
**Required**: Yes

## Question 6

**Source**: "Redirect path is cleared from state"
**Q**: Is the redirect path stored in URL query params, local storage, or app state?
**Why it matters**: Test may need to verify cleanup after redirect.
**A**: Stored in app state store (`usePathRedirectAfterLogin` store), cleared after redirect completes
**Required**: No
