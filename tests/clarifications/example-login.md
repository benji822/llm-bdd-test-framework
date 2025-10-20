# Clarifications: example-login

## Question 1

**Source**: “Submit button logs user in.” (Happy path)
**Q**: After a successful login, should the user be redirected to a specific dashboard route or see any confirmation message that automation must verify?
**Why it matters**: We need a deterministic post-login assertion (URL, element, or message) to confirm success.
**A**: User is redirected to `/dashboard` and sees a heading with text "Welcome back"
**Required**: Yes

## Question 2

**Source**: “Show an inline error messaging the invalid credentials.” (Invalid password)
**Q**: What is the exact inline error text (including capitalization and punctuation) shown for invalid credentials?
**Why it matters**: Automated checks need the precise string to assert the error state reliably.
**A**: "Invalid credentials provided"
**Required**: Yes

## Question 3

**Source**: Only invalid-password scenario described; no guidance for unknown email
**Q**: How should the system respond when the email does not exist (e.g., same inline error as invalid password or different handling)?
**Why it matters**: Coverage of credential validation requires knowing whether to expect shared or distinct error states.
**A**: Same error message as invalid password ("Invalid credentials provided") for security reasons
**Required**: Yes

## Question 4

**Source**: “User enters a valid email and password combination.” (Happy path)
**Q**: What validation behavior is expected when the email or password field is submitted empty—block submission, inline error, or other?
**Why it matters**: Automation needs to know the expected result for empty-field edge cases to build deterministic tests.
**A**: Browser-level HTML5 validation prevents submission with empty required fields
**Required**: Yes

## Question 5

**Source**: “Keep the submit button enabled for retry.” (Invalid password)
**Q**: Should the previously entered email and password remain in the fields after an invalid-password attempt, or should any field be cleared?
**Why it matters**: Test scripts must verify the form state between retries to ensure the UI behaves as specified.
**A**: Email field retains the entered value, password field is cleared for security
**Required**: Yes
