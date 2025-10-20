# Clarifications: login-security

## Question 1

**Source**: "Account lockout" scenario
**Q**: What is the exact error message text shown when account is locked?
**Why it matters**: Tests need to assert the specific error message.
**A**: Translation key `ACCOUNT_LOCKED_MESSAGE` with support link embedded, message includes "contact support"
**Required**: Yes

## Question 2

**Source**: "Error message includes support link"
**Q**: What is the URL for the support/help center link?
**Why it matters**: Test may need to verify link destination.
**A**: `HELP_CENTER_URL` constant (exact URL configured in constants)
**Required**: No

## Question 3

**Source**: "Support link opens in new tab"
**Q**: Should the support link have target="_blank" and security attributes?
**Why it matters**: Accessibility and security validation in tests.
**A**: Yes, uses target="_blank" and rel="noopener noreferrer"
**Required**: Yes

## Question 4

**Source**: "Location blocked" scenario
**Q**: What is the exact URL path for the restricted page redirect?
**Why it matters**: Test needs to verify correct navigation.
**A**: `RESTRICTED_PAGE_URL` constant (exact URL configured in constants)
**Required**: Yes

## Question 5

**Source**: "Self-excluded account" scenario
**Q**: What information is displayed in the timeout modal?
**Why it matters**: Test needs to verify modal content.
**A**: Modal shows timeout type, start time, end time, and options (reopen/continue depending on status)
**Required**: Yes

## Question 6

**Source**: Backend error codes
**Q**: What are the specific backend error codes for each security scenario?
**Why it matters**: May be used for debugging or error state verification.
**A**: Lockout: `error.login_attempt_count_exceeded`, Location: `error.player.location_blocked`, Self-excluded: message contains `self_excluded`
**Required**: No
