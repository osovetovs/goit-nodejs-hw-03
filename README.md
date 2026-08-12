# goit-nodejs-hw-02 — Announcements REST API

A REST API for an announcements board with JWT authentication, refresh token rotation, Prisma/PostgreSQL, Zod validation, ownership checks, and OpenAPI/Swagger documentation.

## Features

- `POST /auth/register` — registers a user, hashes the password with bcrypt, and returns access and refresh tokens.
- `POST /auth/login` — authenticates a user; invalid username or password returns the same `401 Invalid credentials` response; the previous refresh token is replaced.
- `POST /auth/refresh` — verifies the refresh JWT and checks that the token exists in the database, then performs refresh token rotation.
- `POST /auth/logout` — protected route that removes the user's refresh token and returns `204`.
- `GET /auth/me` — protected route that returns the authenticated user's profile without the `password`.
- `GET /announcements` — public list with title search, `newest`/`oldest` sorting, and pagination with 10 records per page.
- `GET /announcements/:id` — public route for retrieving a single announcement with its author.
- `POST /announcements` — creates an announcement for the authenticated user; `userId` is taken only from the access token.
- `PATCH /announcements/:id` — partially updates an announcement owned by the authenticated user.
- `DELETE /announcements/:id` — deletes an announcement owned by the authenticated user and returns `204`.
- Middleware: `authenticate`, `validateBody`, `validateParams`, and `validateQuery`.
- Swagger UI is available at `/api-docs`.

## Tech Stack

Node.js, TypeScript, Express 5, Prisma 7, PostgreSQL, Zod, bcrypt, jsonwebtoken, `@asteasolutions/zod-to-openapi`, and swagger-ui-express.

## Installation and Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

On Windows CMD, you can use:

```cmd
copy .env.example .env
```

Set a valid PostgreSQL connection string and JWT secret in `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/announcements?schema=public
JWT_SECRET=replace_with_a_long_random_secret
PORT=3000
```

Generate the Prisma client and apply migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Start the development server:

```bash
npm run dev
```

Swagger UI:

```text
http://localhost:3000/api-docs
```

## Code Validation

Validate the Prisma schema:

```bash
npm run prisma:validate
```

Run the TypeScript type checker:

```bash
npm run typecheck
```

## API Endpoints

### Authentication

| Method | Route | Authentication |
|---|---|---|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/refresh` | No |
| POST | `/auth/logout` | Bearer token |
| GET | `/auth/me` | Bearer token |

### Announcements

| Method | Route | Authentication |
|---|---|---|
| GET | `/announcements` | No |
| GET | `/announcements/:id` | No |
| POST | `/announcements` | Bearer token |
| PATCH | `/announcements/:id` | Bearer token + owner |
| DELETE | `/announcements/:id` | Bearer token + owner |

### `GET /announcements` Query Parameters

- `search` — case-insensitive search by title.
- `sort` — `newest` (default) or `oldest`.
- `page` — positive page number.
- `perPage` is fixed at `10`.

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

### `POST /auth/register`

- `username`: required string, 3–30 characters
- `email`: required valid email address
- `password`: required string, minimum 6 characters
- `name`: required string, minimum 2 characters

### `POST /announcements`

- `title`: required string, 5–50 characters
- `description`: required string, minimum 10 characters
- `price`: required number greater than 0
- `category`: one of `sale`, `service`, `job`, `other`

`PATCH /announcements/:id` uses the same validation rules, but all fields are optional and an empty `{}` request body is rejected.

## Prisma Models

- `User`: unique `username`, unique `email`, bcrypt-hashed `password`, `name`, and `createdAt`.
- `RefreshToken`: unique `token` with a relation to `User`.
- `Announcement`: `title`, `description`, `price`, `category`, author relation, `createdAt`, and automatic `updatedAt`.

The included initial migration creates all three tables, unique indexes, relation indexes, and foreign keys.
