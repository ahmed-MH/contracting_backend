# Local SQL Server Setup

Use this setup when you want to run Pricify locally without Docker.

## 1. Install SQL Server

Install SQL Server Express or Developer Edition and SQL Server Management Studio. Enable mixed authentication if the installer offers it.

## 2. Enable TCP Connections

Open SQL Server Configuration Manager:

1. Go to `SQL Server Network Configuration > Protocols for SQLEXPRESS`.
2. Enable `TCP/IP`.
3. Restart `SQL Server (SQLEXPRESS)`.

For a fixed port, set TCP port `1433` in the TCP/IP properties and restart SQL Server again.

## 3. Create Database And Login

Use a strong password of your own:

```sql
CREATE DATABASE pricify_db;
GO

USE master;
GO
CREATE LOGIN pricify_app_user WITH PASSWORD = '<use-a-strong-local-password>';
GO

USE pricify_db;
GO
CREATE USER pricify_app_user FOR LOGIN pricify_app_user;
GO
ALTER ROLE db_owner ADD MEMBER pricify_app_user;
GO
```

## 4. Configure Backend Environment

Copy `.env.example` to `.env` in `contracting_backend` and set:

```env
DB_HOST=localhost
DB_INSTANCE=SQLEXPRESS
DB_PORT=
DB_USERNAME=pricify_app_user
DB_PASSWORD=<use-a-strong-local-password>
DB_DATABASE=pricify_db
DB_SYNCHRONIZE=false
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
JWT_SECRET=<use-a-long-random-secret>
FRONTEND_URL=http://localhost:5173
```

If you configured SQL Server to use a fixed port, use:

```env
DB_HOST=localhost
DB_INSTANCE=
DB_PORT=1433
```

## 5. Apply Migrations

Fresh and upgraded databases should be migration-managed:

```powershell
cd contracting_backend
pnpm install
pnpm run db:migrate
```

For first-run administrator creation, temporarily set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env`, start the backend once, then clear those values after the admin exists.

## 6. Run Locally

Backend:

```powershell
cd contracting_backend
pnpm run start:dev
```

Frontend:

```powershell
cd contracting_frontend
pnpm install
pnpm run dev
```

Frontend URL: `http://localhost:5173`

Backend URL: `http://localhost:3000/api`
