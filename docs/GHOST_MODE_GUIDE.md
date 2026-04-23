# Ghost Mode Feature Guide

## Overview

Ghost Mode is a 15-minute privacy feature that activates when a user successfully completes a dare. During ghost mode, all surveillance alerts are suppressed for that user, allowing them to use the app without triggering alerts to their friends.

## How It Works

### Activation Conditions

- Ghost mode activates **only when a dare is completed and approved**
- The user who **completed the dare** (receiver) gets ghost mode
- Duration: **exactly 15 minutes** from activation
- Ghost mode activates through two paths:
  1. **Challenger Review**: When challenger approves the dare as "REAL"
  2. **Friends Validation**: When friends vote the dare as "REAL"

### What Gets Suppressed

During ghost mode, the user's activities **DO NOT** trigger alerts to others:

- **Profile viewing alerts** - Ghost mode user viewing profiles won't alert others
- **Photo viewing alerts** - Ghost mode user viewing photos won't alert others
- **Repeated like alerts** - Ghost mode user liking posts repeatedly won't alert others
- **Post like alerts** - Ghost mode user liking posts won't alert others
- **Mention talking alerts** - Ghost mode user mentioning others in chat won't alert them

### What Still Works

- **Ghost mode users still RECEIVE alerts** - They get all alerts from friends normally
- **Messages still deliver** - All messaging works normally both ways
- **App functionality remains normal** - All features work as expected
- **Only surveillance alerts FROM ghost mode users are suppressed** - No impact on core app features

### Key Behavior Change

- **Normal users**: Send and receive alerts normally
- **Ghost mode users**: Still receive alerts from friends, but their own activities don't trigger alerts to others

## Technical Implementation

### Architecture Components

#### 1. Ghost Mode Service (`ghost-mode.service.ts`)

- **Purpose**: Core service for ghost mode logic and persistence
- **Key Methods**:
  - `activateGhostMode()` - Starts ghost mode for a user
  - `getGhostModeStatus()` - Checks if user is in ghost mode
  - `shouldSuppressAlerts()` - **Critical method** for alert suppression
  - `subscribeToGhostMode()` - Real-time status updates

#### 2. Ghost Mode Store (`useGhostModeStore.ts`)

- **Purpose**: Frontend state management with timer logic
- **Features**:
  - Real-time countdown timer
  - Automatic expiration handling
  - Sync with backend service

#### 3. Ghost Mode Timer Component (`GhostModeTimer.tsx`)

- **Purpose**: Animated UI component showing remaining time
- **Location**: Feed screen header (replaces "DARE" text when active)
- **Features**:
  - Smooth animations and transitions
  - Ghost icon with pulsing effects
  - Countdown display (MM:SS format)

### Integration Points

#### Dare Completion Flow

```typescript
// In dare.service.new.ts - challengerReviewDare method
if (decision === "ACCEPT") {
  // ... existing feed event creation ...

  // Activate ghost mode for the receiver
  await ghostModeService.activateGhostMode({
    userId: dare.receiverId,
    dareId: dareId,
    durationMinutes: 15,
  });
}
```

#### Alert Suppression

```typescript
// In surveillance.service.ts - all tracking methods
// Check if ACTOR (person doing the action) is in ghost mode
const shouldSuppress = await this.shouldSuppressAlerts(actorUserId);
if (shouldSuppress) return; // Skip alert creation
```

## Future Development Guidelines

### When Adding New Alert Features

1. **Always check the ACTOR'S ghost mode first** before creating alerts:

   ```typescript
   // Check the person doing the action, not the target
   const shouldSuppress =
     await ghostModeService.shouldSuppressAlerts(actorUserId);
   if (shouldSuppress) return;
   ```

2. **Use the surveillance service pattern** - integrate with existing surveillance methods
3. **Document the suppression behavior** - clearly note which alerts are suppressed

### When Modifying Ghost Mode

1. **Never break the 15-minute duration** - this is a core requirement
2. **Maintain the activation trigger** - only on dare completion
3. **Preserve the surveillance-only scope** - don't suppress core app features

### Testing Considerations

1. **Test alert suppression** - verify no alerts are generated during ghost mode
2. **Test timer accuracy** - ensure 15-minute duration is exact
3. **Test real-time updates** - verify timer updates across devices
4. **Test edge cases** - app crashes, network issues, etc.

## Data Model

### Ghost Mode Document (Firestore)

```typescript
{
  userId: string,           // User in ghost mode
  isActive: boolean,        // Current status
  activatedAt: Timestamp,   // When ghost mode started
  expiresAt: Timestamp,     // When ghost mode ends
  dareId: string,           // Dare that triggered it
  durationMinutes: number   // Duration (always 15)
}
```

## User Experience

### Visual Indicators

- **Feed Header**: "DARE" text fades out, ghost timer fades in
- **Timer Design**: Purple/voilet theme with ghost icon
- **Animations**: Smooth transitions, pulsing effects
- **Countdown**: Live MM:SS display

### User Understanding

- Users see clear visual feedback when ghost mode is active
- Timer shows exactly when privacy ends
- No confusing behavior - app works normally otherwise

## Troubleshooting

### Common Issues

1. **Ghost mode not activating**: Check dare completion flow
2. **Alerts still firing**: Verify `shouldSuppressAlerts()` integration
3. **Timer not updating**: Check store subscription logic
4. **UI not updating**: Verify component reactivity

### Debug Logging

- Ghost mode activation logs: `"Ghost mode activated for user X"`
- Alert suppression logs: `"Ghost mode active - suppressing alert"`
- Timer expiration: Handled automatically via real-time updates

## Security & Privacy

### Data Protection

- Ghost mode status is stored securely in Firestore
- No sensitive data exposed beyond necessary timing
- Automatic cleanup prevents data accumulation

### Privacy Guarantee

- **15-minute hard limit** - cannot be extended
- **Surveillance-only scope** - core features unaffected
- **Automatic expiration** - no manual deactivation needed

---

## Quick Reference

| Feature                 | Status       | Implementation            |
| ----------------------- | ------------ | ------------------------- |
| 15-minute timer         | **Complete** | `useGhostModeStore`       |
| Alert suppression       | **Complete** | `surveillance.service.ts` |
| UI animations           | **Complete** | `GhostModeTimer.tsx`      |
| Dare completion trigger | **Complete** | `dare.service.new.ts`     |
| Real-time sync          | **Complete** | Firestore listeners       |

**Remember**: Ghost mode is a privacy feature, not a moderation tool. It should always empower users while maintaining app functionality.
