# Clarifications: login-social

## Question 1

**Source**: "Social login section is displayed"
**Q**: Where is the social login section positioned relative to the email/password form?
**Why it matters**: Test needs to verify layout and presence.
**A**: Below the email/password form with 40px margin-top
**Required**: Yes

## Question 2

**Source**: "Social login buttons are visible"
**Q**: Which social login providers are available (Facebook, Google, Apple, etc.)?
**Why it matters**: Test needs to know what buttons to expect.
**A**: Configuration dependent - SocialLogin component handles provider display
**Required**: No

## Question 3

**Source**: "System disables email/password form"
**Q**: What is the exact mechanism for disabling the form during social login?
**Why it matters**: Test needs to verify disabled state.
**A**: `isSocialLoginLoading` state sets `disabled={isLoading}` on all form inputs and submit button
**Required**: Yes

## Question 4

**Source**: "Social login loading state is active"
**Q**: Is there a visual loading indicator during social login?
**Why it matters**: Test may need to wait for loading state.
**A**: Loading state is managed via `isSocialLoginLoading` prop passed to SocialLogin component
**Required**: No

## Question 5

**Source**: "System stores access and refresh tokens"
**Q**: Are tokens stored in the same way as credential login (cookies with 1 week expiration)?
**Why it matters**: Consistency validation between auth methods.
**A**: Yes, same cookie storage with maxAge of ONE_WEEK_IN_SECONDS
**Required**: Yes

## Question 6

**Source**: "User is redirected if redirect path exists"
**Q**: Is redirect handling identical to credential login?
**Why it matters**: Test can reuse same assertions for both auth methods.
**A**: Yes, uses same `pathRedirectAfterLogin` logic and router.push() to redirect
**Required**: Yes
