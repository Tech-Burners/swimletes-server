# Swimletes Server - Development Notes & TODOs

## 📋 Project Overview
- **Project**: Swimletes Backend API (`auravive` / `swimletes-server`)
- **Runtime**: Node.js + Express
- **Database**: MongoDB with Mongoose
- **Realtime**: Socket.io
- **Base Route**: `/api/v1`

---

## 🏗️ Modules Directory Structure

| Module | Description | Status / Notes |
| :--- | :--- | :--- |
| `Auth` | Authentication, Login, Register, Session | Active |
| `Availability` | Instructor availability & schedules | Active |
| `Booking` | Lesson bookings, scheduling, payments | Active |
| `Chat` | Real-time messaging & Socket integration | Active |
| `Dispute` | Dispute handling & mediation | Active |
| `Favourite` | Instructor/Pool bookmarking | Active |
| `FeedBack` | User feedback collection | Active |
| `Instructor` | Instructor profiles, verification, rates | Active |
| `Notification` | Push & in-app notifications (Firebase) | Active |
| `Otp` | One-Time Password generation & verification (Twilio / Mailer) | Active |
| `Pool` | Pool location, details & amenities | Active |
| `Refund` | Payment refund processing | Active |
| `Report` | Incident & account reporting | Active |
| `Review` | Ratings and reviews for instructors/lessons | Active |
| `Settings` | System & application settings | Active |
| `StaticContent` | Terms, Privacy Policy, FAQs | Active |
| `Swimmer` | Swimmer (student) profiles & medical/skill info | Active |
| `Token` | JWT & refresh token management | Active |
| `User` | Base user profiles & roles | Active |
| `Waiver` | Digital liability waiver signing | Active |
| `Withdrawal` | Instructor payout requests & Stripe processing | Active |

---

## 📌 Development Checklist & TODOs

### High Priority
- [ ] Verify image upload workflows (Multer + static asset serving in `public/`)
- [ ] Review environment variables in `.env` for production readiness
- [ ] Test Socket.io real-time chat connections under load
- [ ] Audit Stripe webhook handling and payout flows

### In Progress / Upcoming
- [ ] Validate Swimmer profile updates and data validation (`swimmer.model.js`)
- [ ] Implement automated unit / integration tests
- [ ] Optimize log rotation (manage `combined.log` & `errors.log` size)
- [ ] API documentation sync

---

## ⚙️ Key Environment Variables (`.env`)

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
STRIPE_SECRET_KEY=sk_test_...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
MONITOR_USERNAME=admin
MONITOR_PASSWORD=...
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

- *Record temporary notes, edge cases, and bug investigations here.*
