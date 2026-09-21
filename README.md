# FAQFlow

FAQFlow is an embedded Shopify app for creating, organizing, publishing, and managing frequently asked questions for Shopify stores.

The project is built with React Router, Shopify's React Router app framework, Polaris Web Components, Prisma, and SQLite for the current development database.

## Current Status

**Batch 1 — FAQ Admin Management: Complete**

Current functionality includes:

- Embedded Shopify admin app
- FAQFlow dashboard
- FAQ CRUD
- FAQ search
- FAQ status filtering
- FAQ category filtering
- Draft and published FAQ states
- FAQ sorting
- Category CRUD
- Category slug validation
- Duplicate category slug protection per store
- FAQ-to-category relationship
- Shop-level data isolation
- Delete confirmations
- Loading UI
- Prisma migrations
- Production build and lint workflow
- GitHub repository and main branch configured

## Tech Stack

| Technology | Purpose |
| --- | --- |
| Shopify App | Store admin integration |
| React | UI |
| React Router 7 | Routing and server-side data handling |
| Shopify App React Router | Shopify authentication and embedded app integration |
| Polaris Web Components | Shopify admin UI |
| Prisma | Database ORM |
| SQLite | Current development database |
| Vite | Build tooling |
| ESLint | Code quality |
| Shopify CLI | App development and deployment |

## Project Structure

```text
faq-flow/
├── app/
│   ├── components/
│   │   └── PageLoading.jsx
│   ├── routes/
│   │   ├── app.jsx
│   │   ├── app._index.jsx
│   │   ├── app.faqs._index.jsx
│   │   ├── app.faqs.$id.jsx
│   │   ├── app.categories._index.jsx
│   │   ├── app.categories.$id.jsx
│   │   ├── app.additional.jsx
│   │   ├── auth.$.jsx
│   │   └── webhooks.*
│   ├── db.server.js
│   ├── entry.server.jsx
│   ├── root.jsx
│   ├── routes.js
│   └── shopify.server.js
├── extensions/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── public/
├── shopify.app.toml
├── shopify.web.toml
├── package.json
└── README.md
```

## Admin Navigation

The current embedded admin navigation contains:

- **Dashboard** — `/app`
- **FAQs** — `/app/faqs`
- **Categories** — `/app/categories`

The Dashboard is the application's home page.

## FAQ Management

FAQs currently support:

- Create
- View
- Edit
- Delete
- Publish
- Move back to draft
- Search by question or answer
- Filter by status
- Filter by category
- Assign a category
- Set display sort order

FAQ records are associated with the authenticated Shopify store.

## Category Management

Categories currently support:

- Create
- Edit
- Delete
- Name
- URL-friendly slug
- Description
- Sort order
- FAQ count
- Duplicate slug protection
- Store-level isolation

Category slugs must use lowercase letters, numbers, and hyphens.

Example:

```text
Name: Shipping
Slug: shipping
```

## Database

The current development database uses SQLite with Prisma.

The main models are:

- `Session` — Shopify authentication sessions
- `Category` — FAQ categories
- `Faq` — FAQ records

The FAQ relationship is:

```text
Category
   │
   └── Faq[]
```

An FAQ may also remain uncategorized.

### Prisma Commands

Generate Prisma Client:

```bash
npx prisma generate
```

Validate the schema:

```bash
npx prisma validate
```

Check migration status:

```bash
npx prisma migrate status
```

Create a development migration:

```bash
npx prisma migrate dev
```

Deploy existing migrations:

```bash
npx prisma migrate deploy
```

## Prerequisites

Install the following before development:

- Node.js compatible with the project engine requirement
- npm
- Shopify CLI
- A Shopify Partner account
- A Shopify development store

## Installation

Clone the repository:

```bash
git clone https://github.com/uttam-marakana/faq-flow.git
cd faq-flow
```

Install dependencies:

```bash
npm install
```

Generate Prisma Client:

```bash
npx prisma generate
```

Apply development migrations:

```bash
npx prisma migrate dev
```

## Local Development

Start the Shopify app:

```bash
npm run dev
```

For the current localhost-based development workflow:

```bash
shopify app dev --use-localhost
```

The Shopify CLI provides the local app URL and handles the development app configuration.

## Environment Variables

Secrets and environment-specific values must not be committed to Git.

Use a local `.env` file when required by the Shopify app configuration.

Do not commit:

```text
.env
.env.*
```

The repository's `.gitignore` is configured to keep environment secrets out of Git.

## Shopify App Configuration

The Shopify app configuration is stored in:

```text
shopify.app.toml
```

Current application settings include:

- App name: `FAQFlow`
- Embedded app: enabled
- Admin API access scopes: currently empty
- Webhook API version: `2026-10`

Additional Shopify configuration is stored in:

```text
shopify.web.toml
```

## Development Commands

Start development:

```bash
npm run dev
```

Build the application:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

Generate Prisma Client and apply migrations:

```bash
npm run setup
```

Start the production server after building:

```bash
npm run start
```

Run Prisma commands:

```bash
npm run prisma
```

Run Shopify CLI commands:

```bash
npm run shopify
```

## Git Workflow

The main development branch is:

```text
main
```

GitHub repository:

https://github.com/uttam-marakana/faq-flow

Typical workflow:

```bash
git status
git add .
git commit -m "Describe the change"
git push
```

The repository also keeps the original Shopify React Router template as an `upstream` remote for reference.

## Batch Roadmap

FAQFlow is being developed incrementally.

### Batch 1 — FAQ Admin Management

**Status: Complete**

Includes:

- Dashboard
- FAQ CRUD
- Category CRUD
- FAQ search
- FAQ filters
- FAQ publishing
- Category assignment
- Validation
- Loading UI
- Database migrations
- QA and production build verification

### Batch 2 — Storefront FAQ

Planned work includes the storefront-facing FAQ experience, including the theme app extension and storefront FAQ rendering.

### Future Batches

Planned product areas include:

- FAQ groups
- Advanced FAQ organization
- Storefront search and filtering
- FAQ customization
- Product-specific FAQs
- SEO and FAQ structured data
- Analytics
- Billing
- AI-assisted FAQ features
- Multilingual support
- App Store readiness
- Security and production hardening

The roadmap may evolve as implementation and testing progress.

## Security Notes

- All admin routes authenticate through Shopify.
- FAQ and category queries are scoped to the authenticated shop.
- Category ownership is validated before assignment.
- FAQ ownership is validated before update and delete operations.
- Environment secrets are excluded from Git.
- Production deployment should use a persistent production database rather than the local SQLite development database.

## QA

The current Batch 1 implementation has been tested for:

- FAQ creation
- FAQ editing
- FAQ deletion
- FAQ publishing
- FAQ draft state
- FAQ search
- FAQ filtering
- Category creation
- Category editing
- Category deletion
- Duplicate slug validation
- FAQ/category relationships
- Store-level data isolation
- Prisma migrations
- Production build
- Lint workflow

## Useful Documentation

- Shopify app development: https://shopify.dev/docs/apps
- Shopify CLI: https://shopify.dev/docs/api/shopify-cli
- Shopify React Router: https://shopify.dev/docs/api/shopify-app-react-router
- Polaris Web Components: https://shopify.dev/docs/api/app-home/polaris-web-components
- React Router: https://reactrouter.com/
- Prisma: https://www.prisma.io/docs
- SQLite: https://www.sqlite.org/docs.html

## License

This project is private and under active development.
