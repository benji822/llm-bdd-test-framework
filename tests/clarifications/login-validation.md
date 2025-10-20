# Clarifications: login-validation

## Question 1

**Source**: "Invalid email format" scenario
**Q**: What regex pattern or rules define a valid email format?
**Why it matters**: Test needs to know which email formats should pass/fail validation.
**A**: Pattern: `/\S+@\S+\.\S+/` (must have @ symbol and domain with at least 2 characters)
**Required**: Yes

## Question 2

**Source**: "System shows error 'Required field'"
**Q**: What is the exact translation key or error text for required field validation?
**Why it matters**: Tests need the precise error message to assert.
**A**: Translation key is `REQUIRED_FIELD`, typically displays "Required field"
**Required**: Yes

## Question 3

**Source**: "System shows error 'Invalid email'"
**Q**: What is the exact translation key or error text for invalid email format?
**Why it matters**: Tests need the precise error message to assert.
**A**: Translation key is `INVALID_EMAIL`, typically displays "Invalid email"
**Required**: Yes

## Question 4

**Source**: "Email verification" scenario
**Q**: When does the email verification trigger - on every keystroke, on blur, or on form submission?
**Why it matters**: Timing affects test step sequencing and wait conditions.
**A**: Triggers on change (onChange handler) when email format is valid
**Required**: Yes

## Question 5

**Source**: "If verification fails, show error"
**Q**: What is the exact error message when email verification API fails?
**Why it matters**: Tests need to assert specific error text.
**A**: Translation key is `EMAIL_VARIFICATION_FAILED`, displays "Email verification failed"
**Required**: Yes

## Question 6

**Source**: Form validation mode
**Q**: Is validation triggered on submit, on blur, or real-time as user types?
**Why it matters**: Affects when test should expect error messages to appear.
**A**: Validation mode is `onTouched` - errors appear after user interacts with field and moves away
**Required**: Yes
