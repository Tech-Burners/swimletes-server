# Swimletes Server - Development Notes & Architecture

## 📋 Project Overview

- **Project**: Swimletes Backend API (`swimletes` / `swimletes-server`)
- **Runtime**: Node.js (Express)
- **Database**: MongoDB with Mongoose
- **Realtime**: Socket.io (Separate Socket server instance on dedicated port)
- **Base Route**: `/api/v1`
- **Admin & Monitoring**: Built-in Log Viewer at `/` (`MONITOR_USERNAME` / `MONITOR_PASSWORD`)
- **Seeder**: Automatic admin account seed on startup (`src/seeder/seed.js`)

---

## 🏗️ Modules Directory Structure (`src/modules/`)

| Module | Route Prefix | Description | Status / Implementation Details |
| :--- | :--- | :--- | :--- |
| `Auth` | `/api/v1/auth` | User/Instructor authentication, register, login, session, social logins (Google, Apple), password reset | Active |
| `Availability` | `/api/v1/availability` | Instructor weekly recurring schedules, working hours, and blocked time slots | Active |
| `Booking` | `/api/v1/booking` | Complete lesson lifecycle (create, accept, decline, start, complete, cancel, rebook, tab counts, reminders, admin management) | Active (embeds `Swimmer`, `Waiver`, and `BookingLocation` schemas) |
| `Earnings` | `/api/v1/earnings`, `/withdrawals` | Instructor earnings balance, withdrawal requests, Admin platform earnings analytics (5% booking fee, 15% commission), transaction breakdown, and pending/historical withdrawals | Active (`transaction.model.js`) |
| `Refund` | `/api/v1/refunds`, `/refund`, `/booking/admin/refunds` | Admin refund ledger (dispute, cancellation, manual tabs), manual Stripe refund issuance, and refund details | Active (`refund.model.js`) |
| `Favourite` | `/api/v1/favourite` | Parent/swimmer bookmarked and favorited instructors & pool locations | Active |
| `Otp` | `/api/v1/auth/otp` | OTP generation & verification via Twilio SMS and Nodemailer email | Active |
| `Report` | `/api/v1/report`, `/reports`, `/disputes` | Incident reports, dispute filing & admin resolution workflow | Active (handles both reports & disputes) |
| `Review` | `/api/v1/review` | Rating and review submissions for instructors & completed lessons | Active |
| `ServiceAndPricing` | `/api/v1/service-and-pricing` | Lesson duration, base rate, instructor's own pool, public pools, travel radius & surcharges, age groups, languages, and FAQs | Active |
| `StaticContent` | `/api/v1/static-contents` | Terms of Service, Privacy Policy, About Us, FAQs | Active |
| `Token` | Internal Helper | JWT token generation and verification logic | Active |
| `User` | `/api/v1/user` | Base user profiles (swimmer/parent, instructor, admin), certifications (CPR, First Aid), background check status, geo-location (2dsphere), earnings & stats | Active |
| `PlatformSetting` | `/api/v1/admin/settings/fees` | Platform fee percentage, instructor commission rate, and chronological audit history | Active (`platformSetting.model.js`) |

### 💡 Embedded Sub-Schemas & Integrations

- **Swimmer Profile**: Managed within `src/modules/Booking/booking.model.js` (`swimmerSchema` - name, age, comfort level, medical/fears notes).
- **Waiver Agreement**: Managed within `src/modules/Booking/booking.model.js` (`waiverAgreementSchema` - digital signature, legal name, relationship, agreement timestamp).
- **Client Booking Details Screen** (`40012239:1080`): `GET /api/v1/booking/:id` (accessible via MongoDB `_id` or human-readable `bookingId` e.g. `BK-88214`). Returns strictly real, database-driven values with zero artificial default strings or mockup placeholders:
  - Top-level: `_id`, `bookingId`, `status`, `date`, `startTime`, `endTime`, `duration`, `lessonType`.
  - `instructor`: `_id`, `fullName`, `image`, `email`, `number`, `rating`, `avgRating`, `totalReviews`, `chatId`.
  - `client`: `_id`, `fullName`, `image`, `email`, `number`.
  - `swimmer`: `name`, `age`, `comfortLevel`, `notes`, `bookedFor`.
  - `lesson`: `type`, `duration`, `price`.
  - `waiver`: `isSigned`, `legalName`, `signedDate`, `signerRelationship`, `waiverVersion`.
  - `location`: `locationType`, `poolName`, `address`, `coordinates`.
  - `pricing`: `lessonPrice`, `bookingFee`, `poolEntryFee`, `travelFee`, `discountAmount`, `totalAmount`.
  - `payment`: `method`, `status`, `cardBrand`, `last4`, `paidAt`, `transactionId`, `receiptUrl`.
  - `canCancel`, `cancellationWindow`, `cancelledBy`, `cancellationReason`, `refundAmount`, `cancelledAt`.
  - `canChat`, `chatId`, `createdAt`, `updatedAt`.
  Eliminates all hardcoded mockup strings, synthetic sentences, artificial button text defaults, and schema defaults. Strictly throws 404 if booking is not found.
- **Disputes & Reports**: Handled directly in `src/modules/Report/` (`report.model.js`, `report.service.js`, `report.controller.js`, `report.route.js`) with routes mapped to `/api/v1/report`, `/api/v1/reports`, and `/api/v1/disputes`. Follows the codebase standard: text fields bundled in `data` (JSON string/object) with file attachments (`image`/`photo`) passed separately. Admin disputes query (`GET /api/v1/disputes/admin`) is strictly read-only and returns only the exact columns displayed in the Figma table (`40012554:20231` - `bookingId`, `client`, `instructor`, `date`, `status`, `reason`), with full details (`amount`, `details`, `photos`, `resolution`) returned via drawer API (`GET /api/v1/disputes/admin/:id` - `40012554:20832`). Mobile "Report an issue" sheet (`40012392:3369`) served at `/instructor` and Admin Disputes portal & drawer served at `/admin`.
- **Admin Financial & Operations Portals (Figma)**:
  - **Admin Profile Settings & Fees Configuration** (`40012563:24404`, `40012563:24707` & `40012563:25010`): Served at `/admin/profile` and `/admin#profile`. Provides settings tabs (Profile, Email, Password, Fees & Commission). Manages dynamic Platform Fee (client checkout surcharge, e.g. 5%) and Instructor Commission (payout deduction, e.g. 15%). Divided into 2 clean, separate APIs:
    1. **API 1 (Page `40012563:24404`)**: `GET /api/v1/admin/settings/fees` strictly returns only the current configuration: `platformFee` (`percentage`, `lastChanged`) and `instructorCommission` (`percentage`, `lastChanged`) with zero bloat or static UI text.
    2. **API 2 (Modal `40012563:24707` / `40012563:25010`)**: `GET /api/v1/admin/settings/fees/history?type=platform_fee|instructor_commission` strictly returns the chronological audit changes (`previousPercentage`, `newPercentage`, `changedBy`, `date`). Supports both query and path parameters (`/history/platform-fee`, `/history/instructor-commission`) or all history when queried without filter.
    Actionable via `PATCH /api/v1/admin/settings/fees/platform-fee` and `PATCH /api/v1/admin/settings/fees/commission`.
  - **Admin Verification Queue & Review Drawer** (`40012554:19239` & `40012554:20000`): Served at `/admin` and `/admin/verification`. `GET /api/v1/user/admin/verifications` is strictly clean and returns only table columns (`_id`, `fullName`, `email`, `image`, `instructorType`, `status`, `submittedAt` formatted as relative string e.g. `"2 days ago"`, plus tab counts and pagination), while `GET /api/v1/user/admin/verifications/:id` strictly returns only the fields shown on Figma drawer `40012554:20000` (`_id`, `fullName`, `image`, `submittedAt` as relative e.g. `"Submitted 2 days ago"`, `status`, `instructorType`, `bio`, `primaryCertification` [if certified], `experience` [if experience_based], `cprCertification`, `firstAidCertification`, `liabilityWaiver` [if experience_based], and `backgroundCheck` with masked ID `•••-••-1234` and consent status). Actionable via `PATCH .../approve` and `PATCH .../reject` with rejection feedback modal.
  - **Admin Pending Withdrawals** (`40012563:21572`): `GET /api/v1/earnings/admin/withdrawals/pending` (returns instructor user details, bank accounts, requested amount, available balance at request, and relative request timestamp). Actionable via `PATCH .../approve` or `PATCH .../reject`.
  - **Admin Withdrawal History** (`40012563:22328`): `GET /api/v1/earnings/admin/withdrawals/history` (includes completed/rejected timestamps and rejection reason tooltips).
  - **Admin Refund Ledger** (`40012554:21158`): `GET /api/v1/booking/admin/refunds` (tab counts for all, dispute, cancellation, manual; search & sorting) & `POST /api/v1/booking/admin/refunds/issue` (executes Stripe refund and logs manual refund).
  - **Admin Platform Earnings & Transactions** (`40012563:22986`): `GET /api/v1/earnings/admin/overview` (4 KPI cards: Total Revenue, 5% Booking Fee, 15% Platform Commission, Net Earnings after Refunds + 12-month analytics chart) & `GET /api/v1/earnings/admin/transactions` (Transaction breakdown table).
- **Realtime Notifications & Socket**: Configured in `src/socket/` with `socketNotification.js` and `socketIO.js`.

---

## 📱 Sign-Up & Onboarding Flows (Figma Specs & Lifecycle)

### 1. Client / Swimmer (`role: 'user'`)
1. **Choose Role** (`40012270:15702`): Selects "I am a client" (`role: 'user'`).
2. **Create Account Credentials** (`40010150:402`): `email`, `password`, `confirmPassword` -> `POST /api/v1/auth/sign-up` -> sends OTP to email, returns signup JWT token. (Account is **NOT** created in DB yet).
3. **OTP Verification** (`40010647:994`): 6-digit OTP -> `POST /api/v1/auth/verify-otp` -> verifies OTP and returns signed verified onboarding token `isOtpVerified: true`, `nextStep: 'setup-profile'`. (Account is **NOT** created in DB yet).
4. **Profile Setup & Final Account Creation** (`40012321:1973`): `fullName`, `dob` / `dateOfBirth` (mm/dd/yyyy), `image` (avatar file) -> `PUT /api/v1/auth/update-profile` or `POST /api/v1/auth/setup-profile` -> **Creates User in MongoDB** with `status: 'active'`, `isVerified: true`, and returns official login `accessToken`.

---

### 2. Instructor Dual-Path Onboarding (`role: 'instructor'`)
1. **Choose Role** (`40012274:18627`): Selects "I am an instructor" (`role: 'instructor'`).
2. **Create Account Credentials** (`40012321:2378`): `email`, `password`, `confirmPassword` -> `POST /api/v1/auth/sign-up` -> sends OTP to email, returns signup JWT token. (Account is **NOT** created in DB yet).
3. **OTP Verification** (`40012321:2536`): 6-digit OTP -> `POST /api/v1/auth/verify-otp` -> verifies OTP and returns signed verified onboarding token `isOtpVerified: true`, `nextStep: 'setup-profile-then-documents'`. (Account is **NOT** created in DB yet).
4. **Profile Setup** (`40012321:2425`): `fullName` (legal name), `dob` (18+), `about` (teaching experience bio), `image` (face photo required) -> `PUT /api/v1/auth/update-profile` or `POST /api/v1/auth/setup-profile` -> saves avatar and packages profile data into updated onboarding token (`nextStep: 'submit-documents'`). (Account is **NOT** created in DB yet).
5. **Certification Status Choice** (`40012321:2745` / `40012481:3933`):
   - **Path A: "Yes, I'm certified" (`instructorType: 'certified'`)**:
     - **Screen 6: Your Certification** (`40012471:3628`): `certificationName`, `certificationIssuer` / `issuingBody`, `certificationExpiryDate`, `certificate` file.
     - **Screen 7 & 8: CPR & First Aid** (`40012471:9537`): `cprCertificate` & `firstAidCertificate` files.
     - **Screen 9: Background Check** (`40012478:1799`): `idType` (SSN / Passport / Driver's License / Birth Certificate), `idNumber`, `identityProof` document, `isConsentConfirmed: true`.
     - **Submission**: `POST /api/v1/auth/instructor/onboarding` -> **Creates Certified Instructor in MongoDB** with `status: 'pending'`, `isVerified: false`, and returns official login `accessToken`.
   - **Path B: "No, but I have experience" (`instructorType: 'experience_based'`)**:
     - **Screen 10: Status Confirmation** (`40012481:3933`): `instructorType: 'experience_based'`.
     - **Screen 11: Your Experience** (`40012481:3976`): `experienceYears` (number), `experienceDescription` (swimming experience bio), `referenceName` (optional), `referenceContact` (optional phone or email).
     - **Screen 12: CPR & First Aid** (`40012481:4034`): `cprCertificate` & `firstAidCertificate` files.
     - **Screen 13: Additional Liability Waiver** (`40012481:4088`): `isWaiverAgreed: true` (Terms acknowledgment & Hold Harmless liability waiver).
     - **Screen 14 & 15: Background Check** (`40012481:4219`): `idType` (SSN / Passport / Driver's License / Birth Certificate), `idNumber`, `identityProof` document, `isConsentConfirmed: true`.
     - **Submission**: `POST /api/v1/auth/instructor/onboarding` -> **Creates Experience-Based Instructor in MongoDB** with `status: 'pending'`, `isVerified: false`, all experience details, waiver agreement timestamp, and returns official login `accessToken`.


---

## 📌 Development Checklist & TODOs

### High Priority

- [ ] Log file rotation / cleanup (Current `combined.log` and `errors.log` are growing large; add `winston-daily-rotate-file`)
- [x] Stripe PaymentIntents, auto-checkout, webhooks, and automatic cancellation/decline refunds
- [ ] Verify image upload workflows (Multer + static asset serving in `public/uploads/`)
- [ ] Review environment variables in `.env` for production deployment

### In Progress / Upcoming

- [ ] Test Socket.io real-time chat & notification connections under load
- [ ] Validate Swimmer and Waiver payload validation in Booking flow
- [ ] Implement automated unit / integration tests (Jest / Supertest)
- [ ] API documentation sync (Postman / Swagger)

---

## ⚙️ Key Environment Variables (`.env`)

```env
# Server Configuration
BACKEND_PORT=3001
SOCKET_PORT=3021
API_SERVER_IP=localhost
APPNAME=swimletes
NODE_ENV=development

# Database
MONGODB_CONNECTION=mongodb+srv://<username>:<password>@cluster.mongodb.net/swimletes?retryWrites=true&w=majority

# Security & JWT
JWT_ACCESS_TOKEN=your_jwt_access_secret
JWT_REFRESH_TOKEN=your_jwt_refresh_secret
SESSION_SECRET=your_session_secret

# Admin Seeder
ADMIN_EMAIL=admin@swimletes.com
ADMIN_PASSWORD=your_admin_secure_password

# Log Viewer Monitor
MONITOR_USERNAME=admin
MONITOR_PASSWORD=your_monitor_password

# Email (Nodemailer / SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Social Auth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
APPLE_CLIENT_ID=your_apple_client_id

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_...

# OTP Settings
OTP_EXPIRY_TIME=3
```

---

## 🚀 Common Commands

```bash
# Start development server with Nodemon
npm run dev

# Install new dependency
npm install <package-name>
```

---

## 📝 Developer Scratchpad & Bug Log

- _Record temporary notes, edge cases, and bug investigations here._
