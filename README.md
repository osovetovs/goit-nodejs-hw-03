# goit-nodejs-hw-03 — Announcements REST API

A production-ready REST API for an announcements board built with Node.js, TypeScript, Express, Prisma, and PostgreSQL.

The API includes JWT authentication with refresh-token rotation, announcement ownership checks, image uploads to Cloudinary, request logging with Pino, Helmet security headers, CORS protection, authentication rate limiting, OpenAPI/Swagger documentation, and automated Vitest coverage.

## Features

### Authentication

- `POST /auth/register`
  - Registers a new user.
  - Passwords are hashed with bcrypt.
  - Returns access and refresh tokens.
  - Logs successful registrations with Pino.

- `POST /auth/login`
  - Authenticates a user.
  - Returns access and refresh tokens.
  - Replaces the previous stored refresh token.
  - Logs successful logins with Pino.

- `POST /auth/refresh`
  - Verifies the refresh JWT.
  - Confirms that the refresh token exists in the database.
  - Rotates the refresh token.
  - Previously used refresh tokens cannot be reused.

- `POST /auth/logout`
  - Protected route.
  - Removes the user's stored refresh tokens.
  - Returns `204 No Content`.

- `GET /auth/me`
  - Protected route.
  - Returns the authenticated user's profile.
  - Never exposes the password.

### Announcements

- `GET /announcements`
  - Public endpoint.
  - Supports title search.
  - Supports newest/oldest sorting.
  - Supports pagination.
  - Returns 10 announcements per page.

- `GET /announcements/:id`
  - Public endpoint.
  - Returns one announcement and its author.

- `POST /announcements`
  - Protected endpoint.
  - Creates an announcement for the authenticated user.
  - Accepts `multipart/form-data`.
  - Image upload is optional.
  - Uploaded images are stored in Cloudinary.
  - Only the resulting Cloudinary URL is saved in PostgreSQL.

- `PATCH /announcements/:id`
  - Protected endpoint.
  - Only the announcement owner can update it.
  - Supports partial field updates.
  - Supports image-only updates.
  - Accepts `multipart/form-data`.
  - A new image can be uploaded to Cloudinary.

- `DELETE /announcements/:id`
  - Protected endpoint.
  - Only the announcement owner can delete it.
  - Returns `204 No Content`.

## Security

### Helmet

Helmet is connected globally and adds security-related HTTP response headers, including:

- Content Security Policy
- `X-Content-Type-Options`
- `X-Frame-Options`
- Strict Transport Security
- Referrer Policy
- Cross-Origin policies

### CORS

Allowed origins are configured through the `ALLOWED_ORIGINS` environment variable.

Example:

```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

Requests from origins that are not on the allowlist receive:

```text
403 Forbidden
```

Requests without an `Origin` header, such as server-to-server or command-line requests, are allowed.

### Rate Limiting

Authentication routes are protected with rate limiting:

```text
Maximum requests: 10
Window: 15 minutes
Scope: per IP address
```

The 11th request within the window receives:

```text
429 Too Many Requests
```

The rate limiter is applied to `/auth` routes only.

## Logging

The project uses:

- `pino`
- `pino-http`
- `pino-pretty` during local development

Every HTTP request is logged automatically.

Important application events are also explicitly logged:

- successful user registration
- successful login
- announcement creation
- announcement photo upload

## Image Uploads

Announcement images are handled using Multer and Cloudinary.

Upload flow:

1. The client sends `multipart/form-data`.
2. Multer temporarily stores the image in the local `uploads/` directory.
3. The server uploads the file to Cloudinary.
4. Cloudinary returns a secure HTTPS URL.
5. The URL is saved as `imageUrl` in PostgreSQL.
6. The temporary local file is deleted.

Creating an announcement without an image is supported and results in:

```json
{
  "imageUrl": null
}
```

The multipart file field is named:

```text
image
```

## Tech Stack

- Node.js
- TypeScript
- Express 5
- Prisma 7
- PostgreSQL
- Zod
- bcrypt
- JSON Web Tokens
- Helmet
- CORS
- express-rate-limit
- Pino
- pino-http
- Multer
- Cloudinary
- Vitest
- OpenAPI
- Swagger UI
- `@asteasolutions/zod-to-openapi`

## Installation

Install dependencies:

```bash
npm install
```

Create a local `.env` file from `.env.example`.

### Windows CMD

```cmd
copy .env.example .env
```

### macOS / Linux

```bash
cp .env.example .env
```

## Environment Variables

Configure `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/announcements?schema=public
JWT_SECRET=replace_with_a_long_random_secret
PORT=3000

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Important

The real `.env` file must never be committed to Git.

Only `.env.example`, containing placeholder values, should be stored in the repository.

Cloudinary API credentials must remain private.

## Prisma Setup

Validate the Prisma schema:

```bash
npm run prisma:validate
```

Generate Prisma Client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run prisma:migrate
```

The `Announcement` model includes an optional image URL:

```prisma
model Announcement {
  id          Int      @id @default(autoincrement())
  title       String
  description String
  price       Float
  category    String
  imageUrl    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([createdAt])
}
```

## Running the Application

Start the development server:

```bash
npm run dev
```

The API runs by default at:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/api-docs
```

The production-style start command is:

```bash
npm start
```

## API Documentation

The project generates its OpenAPI document using `@asteasolutions/zod-to-openapi`.

Routes are registered with:

```ts
registry.registerPath()
```

Swagger UI is available at:

```text
GET /api-docs
```

The create and update announcement endpoints are documented as:

```text
multipart/form-data
```

and include the optional binary `image` field.

## API Endpoints

### Authentication

| Method | Endpoint | Authentication |
|---|---|---|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/refresh` | No |
| POST | `/auth/logout` | Bearer access token |
| GET | `/auth/me` | Bearer access token |

### Announcements

| Method | Endpoint | Authentication |
|---|---|---|
| GET | `/announcements` | No |
| GET | `/announcements/:id` | No |
| POST | `/announcements` | Bearer access token |
| PATCH | `/announcements/:id` | Bearer access token + owner |
| DELETE | `/announcements/:id` | Bearer access token + owner |

## Announcement Query Parameters

`GET /announcements` supports:

### `search`

Case-insensitive title search.

Example:

```text
GET /announcements?search=bike
```

### `sort`

Available values:

```text
newest
oldest
```

Default:

```text
newest
```

Example:

```text
GET /announcements?sort=oldest
```

### `page`

Positive integer page number.

Example:

```text
GET /announcements?page=2
```

Pagination uses:

```text
10 records per page
```

Example response:

```json
{
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "totalPages": 0,
    "perPage": 10
  }
}
```

## Validation Rules

### Registration

`POST /auth/register`

- `username`
  - required
  - string
  - minimum 3 characters
  - maximum 30 characters

- `email`
  - required
  - valid email address

- `password`
  - required
  - string
  - minimum 6 characters

- `name`
  - required
  - string
  - minimum 2 characters

Example:

```json
{
  "username": "testuser",
  "email": "testuser@example.com",
  "password": "test123",
  "name": "Test User"
}
```

### Create Announcement

`POST /announcements`

The request uses `multipart/form-data`.

Required fields:

- `title`
  - minimum 5 characters
  - maximum 50 characters

- `description`
  - minimum 10 characters

- `price`
  - number greater than 0

- `category`
  - one of:
    - `sale`
    - `service`
    - `job`
    - `other`

Optional:

- `image`
  - uploaded file

### Update Announcement

`PATCH /announcements/:id`

The same field validation rules apply, but fields are optional.

At least one field or an image must be supplied.

The endpoint therefore supports:

- text-only update
- price-only update
- category-only update
- image-only update
- text fields and image together

## Authentication

Protected routes expect an access token in the HTTP Authorization header:

```text
Authorization: Bearer <accessToken>
```

Access and refresh tokens are intentionally different.

A refresh token cannot be used as an access token.

## Ownership

Users can only modify or delete their own announcements.

Trying to update or delete another user's announcement returns:

```text
403 Access denied
```

## HTTP Status Codes

Common responses include:

| Status | Meaning |
|---|---|
| `200` | Successful request |
| `201` | Resource created |
| `204` | Successful request with no response body |
| `400` | Validation error |
| `401` | Authentication failed |
| `403` | Access denied or origin not allowed |
| `404` | Resource not found |
| `409` | Username or email already exists |
| `429` | Too many authentication requests |
| `500` | Internal server error |

## Testing

The project uses Vitest.

Run all tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Current automated test suite:

```text
2 test files
49 tests
49 passing
```

### Unit / Authentication Tests

`tests/auth.test.ts`

Contains 5 tests covering:

- registration validation
- bcrypt password hashing and verification
- valid access token authentication
- refresh-token rejection as an access token
- missing Authorization header

### API Tests

`tests/api.test.ts`

Contains 44 tests covering positive, negative, and boundary scenarios for:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /announcements`
- `GET /announcements/:id`
- `POST /announcements`
- `PATCH /announcements/:id`
- `DELETE /announcements/:id`
- Helmet headers
- allowed CORS origins
- blocked CORS origins
- authentication rate limiting
- ownership restrictions
- pagination boundaries
- validation boundaries
- multipart requests
- image uploads
- temporary upload cleanup
- general 404 handling

Prisma and Cloudinary are mocked by the API test suite so automated tests do not create test records in the production/development PostgreSQL database or upload test images to the real Cloudinary account.

## Type Checking

Run:

```bash
npm run typecheck
```

The command executes:

```text
tsc --noEmit
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server in watch mode |
| `npm start` | Start server |
| `npm test` | Run all Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run prisma:validate` | Validate Prisma schema |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run Prisma development migrations |

## Project Structure

```text
.
├── app.ts
├── prisma.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app.ts
│   ├── logger.ts
│   ├── openapi.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── announcements.controller.ts
│   │
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── authRateLimiter.ts
│   │   ├── upload.ts
│   │   └── validate.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   └── announcements.routes.ts
│   │
│   ├── services/
│   │   └── cloudinary.ts
│   │
│   └── validators/
│       ├── auth.validator.ts
│       └── announcements.validator.ts
│
├── tests/
│   ├── auth.test.ts
│   └── api.test.ts
│
└── uploads/
    └── .gitkeep
```

## Verification

Before submitting the homework, run:

```bash
npm run typecheck
npm test
npm run prisma:validate
```

Then start the server:

```bash
npm run dev
```

Verify Swagger UI at:

```text
http://localhost:3000/api-docs
```

Expected automated test result:

```text
Test Files  2 passed (2)
Tests       49 passed (49)
```
