# Clarifications: login-basic

## Question 1

**Source**: "User is redirected to dashboard" (Happy path)
**Q**: What is the exact URL path for the dashboard that users should be redirected to after successful login?
**Why it matters**: Test needs to assert the correct URL for navigation verification.
**A**: User is redirected to `/dashboard` (or remains on current page if no redirect path was specified)
**Required**: Yes

## Question 2

**Source**: "Dashboard displays welcome message" (Happy path)
**Q**: What is the exact text of the welcome message shown on the dashboard?
**Why it matters**: Automated tests need the precise string to verify successful authentication.
**A**: "Welcome back"
**Required**: Yes

## Question 3

**Source**: "Invalid password" and "Unknown email" scenarios
**Q**: Should the error message be identical for both invalid password and unknown email cases?
**Why it matters**: Security best practice to prevent user enumeration attacks.
**A**: Yes, both show "Invalid credentials provided" for security reasons
**Required**: Yes

## Question 4

**Source**: "Email field retains the entered value" (Invalid password)
**Q**: What happens to the password field after an invalid login attempt - is it cleared or retained?
**Why it matters**: Test needs to verify the form state after error.
**A**: Email field retains value, password field is not explicitly cleared by the component
**Required**: Yes

## Question 5

**Source**: Authentication flow
**Q**: Are access and refresh tokens stored as cookies, and what is their expiration time?
**Why it matters**: Tests may need to verify token storage for security validation.
**A**: Both tokens stored as cookies with maxAge of 1 week (604800 seconds)
**Required**: No
