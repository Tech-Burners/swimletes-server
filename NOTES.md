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
| `Favourite` | `/api/v1/favourite` | Parent/swimmer bookmarked and favorited instructors & pool locations | Active |
| `Otp` | `/api/v1/auth/otp` | OTP generation & verification via Twilio SMS and Nodemailer email | Active |
| `Report` | `/api/v1/report`, `/reports`, `/disputes` | Incident reports, dispute filing & admin resolution workflow | Active (handles both reports & disputes) |
| `Review` | `/api/v1/review` | Rating and review submissions for instructors & completed lessons | Active |
| `ServiceAndPricing` | `/api/v1/service-and-pricing` | Lesson duration, base rate, instructor's own pool, public pools, travel radius & surcharges, age groups, languages, and FAQs | Active |
| `StaticContent` | `/api/v1/static-contents` | Terms of Service, Privacy Policy, About Us, FAQs | Active |
| `Token` | Internal Helper | JWT token generation and verification logic | Active |
| `User` | `/api/v1/user` | Base user profiles (swimmer/parent, instructor, admin), certifications (CPR, First Aid), background check status, geo-location (2dsphere), earnings & stats | Active |

### 💡 Embedded Sub-Schemas & Integrations

- **Swimmer Profile**: Managed within `src/modules/Booking/booking.model.js` (`swimmerSchema` - name, age, comfort level, medical/fears notes).
- **Waiver Agreement**: Managed within `src/modules/Booking/booking.model.js` (`waiverAgreementSchema` - digital signature, legal name, relationship, agreement timestamp).
- **Pools & Locations**: Defined in `src/modules/ServiceAndPricing/serviceAndPricing.model.js` (`publicPoolSchema`, `ownPool`, `travelToClient`) and snapshot in `Booking`.
- **Disputes**: Handled directly in `src/modules/Report/` with routes mapped to `/api/v1/report`, `/api/v1/reports`, and `/api/v1/disputes`.
- **Realtime Notifications & Socket**: Configured in `src/socket/` with `socketNotification.js` and `socketIO.js`.

---

## 📱 Sign-Up & Onboarding Flows (Figma Specs & Lifecycle)

### 1. Client / Swimmer (`role: 'user'`)
1. **Choose Role** (`40012270:15702`): Selects "I am a client" (`role: 'user'`).
2. **Create Account Credentials** (`40010150:402`): `email`, `password`, `confirmPassword` -> `POST /api/v1/auth/sign-up` -> sends OTP to email, returns signup JWT token. (Account is **NOT** created in DB yet).
3. **OTP Verification** (`40010647:994`): 6-digit OTP -> `POST /api/v1/auth/verify-otp` -> verifies OTP and returns signed verified onboarding token `isOtpVerified: true`. (Account is **NOT** created in DB yet).
4. **Profile Setup & Account Creation** (`40012321:1973`): `fullName`, `dob` / `dateOfBirth`, `image` (avatar file) -> `PUT /api/v1/auth/update-profile` or `POST /api/v1/auth/setup-profile` -> **Creates User in MongoDB** with `status: 'active'`, `isVerified: true`, and returns official login `accessToken`.

### 2. Instructor (`role: 'instructor'`)
1. **Choose Role** (`40012274:18627`): Selects "I am an instructor" (`role: 'instructor'`).
2. **Create Account Credentials** (`40012321:2378`): `email`, `password`, `confirmPassword` -> `POST /api/v1/auth/sign-up` -> sends OTP to email, returns signup JWT token. (Account is **NOT** created in DB yet).
3. **OTP Verification** (`40012321:2536`): 6-digit OTP -> `POST /api/v1/auth/verify-otp` -> verifies OTP and returns signed verified onboarding token `isOtpVerified: true`. (Account is **NOT** created in DB yet).
4. **Profile Setup** (`40012321:2425`): `fullName` (legal name), `dob` (18+), `about` (experience bio), `image` (clear face) -> `PUT /api/v1/auth/update-profile` or `POST /api/v1/auth/setup-profile` -> stores avatar and packages profile data into updated onboarding token (`nextStep: 'submit-documents'`). (Account is **NOT** created in DB yet).
5. **Certifications, Waiver & Verification Documents (Final Step & Account Creation)**:
   - **Certification Status** (`40012321:2745` / `40012481:3933`):
     - **Certified** (`40012471:3628`): `certificationName`, `certificationIssuer`, `certificationExpiryDate`, `certificate` file.
     - **Experience-Based** (`40012481:4088`): `isWaiverAgreed: true` (Acknowledgment of status & Hold Harmless liability waiver).
   - **CPR & First Aid** (`40012471:9537` / `40012481:4034`): Required for all instructors (`cprCertificate` & `firstAidCertificate` files).
   - **Background Check** (`40012477:1623`): `idType` (SSN / Passport / Driver's License / Birth Certificate), `idNumber`, `identityProof` document, `isConsentConfirmed: true`.
   - **Submission Endpoint**: `POST /api/v1/auth/instructor/onboarding` (or `/update-documents` / `/instructor-documents`) -> **Creates Instructor in MongoDB** with `status: 'pending'`, `isVerified: false`, all documents & profile fields, and returns official login `accessToken`.


---

## 📌 Development Checklist & TODOs

### High Priority

- [ ] Log file rotation / cleanup (Current `combined.log` and `errors.log` are growing large; add `winston-daily-rotate-file`)
- [ ] Stripe webhook handling and instructor payout settlement
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
