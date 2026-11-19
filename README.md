# repair-shop-employee

Standalone Expo / React Native app for **shop staff (technicians + employees)** of the Globo Green platform. Sibling to `repair-shop-mobile` (which is the customer + owner + tech app) and `repair-shop-admin` (Next.js admin). Backed by the same `epair-shop-saas` Spring services.

## What it does (today)

Logged-in shop staff land on the technician stack:

- My Profile
- Dashboard
- My Tickets (assigned tickets, pull to refresh)
- Ticket Detail
- Update Status
- Add Repair Notes
- Upload Repair Images
- Apply for Leave

Customer accounts (`roles: ['CUSTOMER']`) are explicitly rejected at the login boundary — the session is cleared and the user is sent back to the login screen.

## What was copied from `repair-shop-mobile`

| Area | Copied verbatim | Adapted |
| --- | --- | --- |
| Root config (`babel`, `metro`, `tailwind`, `global.css`, `nativewind-env.d.js`) | Yes | — |
| `package.json` | — | Dropped customer-only deps that no tech screen uses (`expo-location`, `expo-print`, `expo-router`, `expo-sharing`, `react-native-view-shot`, `@react-navigation/bottom-tabs`) |
| `app.config.js` | — | Slug renamed; location permissions + master-data env removed |
| `src/api/client.js` | Yes | — (only `ticketApi`, `authApi`, `technicianApi`, `shopApi`, `userApi` are exported now) |
| `src/api/config.js` | — | Pruned to bases the staff app actually hits |
| `src/api/auth.js` | — | Only `login` / `logout` (no customer register/login, no `fetchMe`/`switchShop` — add when needed) |
| `src/auth/session.js`, `src/store/*`, `src/theme/colors.js` | Yes | — |
| `src/components/{BackButton,confirm,ui,ApiPicker}.js` + `src/components/rnr/*` | Yes | — |
| 8 technician screens | Source contents | Flattened to `src/screens/*` (no `owner/technician/` nesting) — `ticketApi` imports rewritten from `../../../api/client` to `../api/client` |
| `src/navigation/TechnicianNavigator.js` | Yes | — |
| `src/navigation/RootNavigator.js` | — | No more role branching; just "Login if no token" → `TechnicianNavigator` |
| `src/screens/LoginScreen.js` | — | Removed the CUSTOMER tab + register flow entirely (staff email/mobile + password/OTP + optional shop slug only) |
| `App.js` | Yes (slight) | Same providers and nav theme as the mobile app |

## What was NOT brought across

- Owner navigator + owner screens (booking, KYC, marketplace, settings…)
- Customer navigator + customer screens
- `expo-router`, `expo-location`, `expo-print`, `expo-sharing` and related screens
- Master-data API (brands/models/repair services) and the master-data env wiring
- Marketplace, pickups, orders, customer, notifications, masterDataImages API modules
- `hooks/useCustomerLocation`, `utils/bookingDevice`, `utils/travelTimes`, `screens/common/serviceHistoryPhases` — none of the technician screens import them

Add them back individually if a future screen needs them.

## Run it

```bash
cd repair-shop-employee
npm install --legacy-peer-deps
# point the app at the host running the auth/ticket services (8081/8082 by default)
$env:EXPO_PUBLIC_API_HOST = "192.168.1.5"
# Expo Metro defaults to 8081, same port as auth-service — override it.
npx expo start --port 8181
```

Service ports the app talks to (from `src/api/config.js`):

| Base | Port |
| --- | --- |
| `AUTH_BASE` | 8081 |
| `TICKET_BASE` | 8082 |
| `USER_BASE` | 8083 |
| `SHOP_BASE` | 8084 |
| `TECHNICIAN_BASE` | 8085 |

## Notes on auth

- Login posts to `/auth/login` on auth-service. Pass an email/mobile + `password` *or* `otp`, plus an optional `shopSlug` if the staff member belongs to more than one shop.
- The persisted session shape mirrors what `repair-shop-mobile` writes to `AsyncStorage` (`auth.token` + `auth.user`), so the same backend tokens work here without any server-side change.
- 401 from any API call clears the session and sends the user back to the login screen. 403 does *not* — it surfaces as an error inside the screen that made the call.
