# Swimletes Backend API Server 🏊‍♂️

A robust Node.js, Express, and MongoDB backend application powering the Swimletes swim lesson marketplace. Features end-to-end lesson booking workflows, instructor dual-path onboarding, Stripe payments & refunds, real-time Socket.io chat and notifications, provider live GPS tracking, and an admin dashboard.

---

## 🚀 Key Features

- **Dual-Path Instructor Onboarding**: Separate verification flows for certified instructors (CPR, First Aid, certification documents) and experienced instructors (experience history, references, liability waivers, background checks).
- **End-to-End Lesson Booking**:
  - Step-by-step booking lifecycle: creation, conflict checks, instructor accept/decline, lesson start, client confirmation, cancellation, and rebooking.
  - Transparent pricing breakdowns (lesson price, 5% platform fee, pool entry fees, travel surcharges).
  - Background cron jobs for automatic activation at lesson start and 72-hour auto-confirmation.
- **Stripe Integration**:
  - PaymentIntents and Hosted Checkout Sessions (`/create-checkout-session`, `/checkout-link`).
  - Automatic refunds on booking cancellation/decline, dispute refunds, and manual admin refunds.
- **Real-Time Socket.io Infrastructure**:
  - 1-on-1 private messaging with attachments (photos, voice, documents) and typing status.
  - Real-time provider GPS tracking (`providerAddress`) for arrival status.
  - Real-time notification badges and push updates.
  - Dual-port Express listener (`8049` & `8047`) and dedicated Socket port (`3049`).
  - Built-in browser-based Socket Tester UI at `/public/socket-tester.html`.
- **Admin Management & Financial Analytics**:
  - Verification review queue and detailed instructor approval/rejection drawer.
  - Dispute resolution workflow with evidence photo attachments.
  - Financial overview (gross volume, 5% booking fee, 15% instructor commission, net earnings).
  - Refund ledger and withdrawal approval system.
  - Dynamic platform fee and commission configuration with chronological audit history.
- **Logging & Monitoring**: Winston file logging (`combined.log`, `errors.log`) and web-based developer Log Viewer at `/`.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-Time Communication**: Socket.io
- **Payment Gateway**: Stripe API
- **Authentication**: JWT, bcryptjs, OTP (Nodemailer SMTP)
- **Job Scheduling**: node-cron
- **Logging**: Winston

---

## 📁 Directory Structure

```
swimletes-server/
├── public/                 # Static assets, uploads, and UI tester pages
│   ├── admin/             # Admin portal HTML preview
│   ├── instructor/        # Instructor mobile web preview
│   ├── socket-tester.html # Interactive Socket.io tester
│   └── uploads/           # Uploaded user images, certificates & documents
├── src/
│   ├── app.js             # Express app setup, middlewares, and route mounting
│   ├── server.js          # HTTP & Socket.io server entry point
│   ├── helpers/           # Utility helpers (Stripe, cronJobs, logger, email, time)
│   ├── middlewares/       # Auth (JWT & roles), file upload (Multer), error handlers
│   ├── modules/           # Feature modules (Controller, Service, Route, Model)
│   │   ├── Auth/          # Authentication & dual-path onboarding
│   │   ├── Availability/  # Instructor schedule & blocked slots
│   │   ├── Booking/       # Booking lifecycle, pricing, Stripe checkout & refunds
│   │   ├── Chat/          # 1-on-1 messaging & chat rooms
│   │   ├── Earnings/      # Instructor payouts & admin financial analytics
│   │   ├── Favourite/     # Saved instructors & pools
│   │   ├── Notification/  # Persistent & real-time notification feeds
│   │   ├── Otp/           # OTP generation & verification
│   │   ├── PlatformSetting/# Dynamic platform fee & commission rates
│   │   ├── Report/        # Incident reports & dispute resolution
│   │   ├── Review/        # Instructor & lesson ratings
│   │   ├── ServiceAndPricing/ # Pricing, pool types, travel fees, FAQs
│   │   ├── StaticContent/ # Terms, Privacy Policy, FAQs
│   │   ├── Token/         # Internal JWT generation
│   │   └── User/          # User & instructor profiles, verifications
│   ├── routes/            # Global API route aggregator (`/api/v1`)
│   ├── seeder/            # Automatic Super Admin seeder
│   └── socket/            # Socket.io authentication, chat, and notification handlers
└── package.json           # Dependencies and scripts
```

---

## ⚙️ Environment Configuration (`.env`)

Create a `.env` file in the project root with the following parameters:

```env
# Server
BACKEND_PORT=8049
SOCKET_PORT=3049
API_SERVER_IP=localhost
APPNAME=swimletes
NODE_ENV=development

# Database
MONGODB_CONNECTION=mongodb+srv://<username>:<password>@cluster.mongodb.net/swimletesDB_v1?retryWrites=true&w=majority

# JWT & Security
JWT_ACCESS_TOKEN=your_jwt_access_secret
JWT_REFRESH_TOKEN=your_jwt_refresh_secret
SESSION_SECRET=your_session_secret

# Default Admin
ADMIN_EMAIL=admin@swimletes.com
ADMIN_PASSWORD=your_admin_password
DEFAULT_PASSWORD=your_default_password

# Log Viewer Monitor
MONITOR_USERNAME=nasif
MONITOR_PASSWORD=your_monitor_password

# Mail (SMTP)
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Social Auth & Maps
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
APPLE_CLIENT_ID=your_apple_client_id
GOOGLE_MAPS_API_KEY=your_google_maps_key

# Stripe Payments
STRIPE_SK=sk_test_...
STRIPE_PK=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Booking & Service Config
RADIUS_IN_KM=5
MAX_BOOKINGS_PER_SLOT=1
OTP_EXPIRY_TIME=3
```

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

The application will start on:
- **HTTP Server**: `http://localhost:8049` (with secondary port fallback `8047`)
- **Socket.io Server**: `http://localhost:3049` (also attached to port `8049`)
- **Developer Log Monitor**: `http://localhost:8049/`
- **Real-Time Socket Tester**: `http://localhost:8049/public/socket-tester.html`

---

## 📡 API Overview (`/api/v1`)

| Route Prefix | Module | Main Capabilities |
| :--- | :--- | :--- |
| `/api/v1/auth` | **Auth** | Sign up, OTP verification, login, profile setup, instructor document submission |
| `/api/v1/user` | **User** | Profile updates, admin verifications queue (`/admin/verifications`), approval/rejection |
| `/api/v1/booking` | **Booking** | Create booking, conflict check (`/check-conflict`), accept, decline, complete, cancel, rebook |
| `/api/v1/booking` | **Payments** | Checkout session (`/create-checkout-session`), PaymentIntent, Stripe webhooks |
| `/api/v1/chat` | **Chat** | Conversation list, message history, file attachments |
| `/api/v1/notifications` | **Notification** | Grouped notification feeds (`Today`, `Yesterday`, `Earlier`), unread counts, mark all read |
| `/api/v1/earnings` | **Earnings** | Instructor balance, payout requests, admin financial KPI cards and transactions |
| `/api/v1/refunds` | **Refunds** | Admin refund ledger and manual/automatic Stripe refunds |
| `/api/v1/disputes` | **Report** | Dispute/issue reporting with photo attachments and admin resolution |
| `/api/v1/availability`| **Availability**| Instructor recurring schedules and blocked dates |
| `/api/v1/service-and-pricing` | **Pricing** | Rates, pool options, travel surcharges, and FAQs |
| `/api/v1/admin/settings/fees` | **PlatformSetting** | Platform fee % and instructor commission % management |

---

## 📄 License
ISC
