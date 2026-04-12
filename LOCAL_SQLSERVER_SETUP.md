# Local SQL Server Express Setup

Use this setup when you want to run the project locally without Docker.

## 1. Install SQL Server Express

Install:

- SQL Server Express
- SQL Server Management Studio (SSMS)

During installation, enable mixed authentication mode if the installer offers it.

## 2. Enable local TCP connections

Open `SQL Server Configuration Manager` and:

1. Go to `SQL Server Network Configuration > Protocols for SQLEXPRESS`
2. Enable `TCP/IP`
3. Restart `SQL Server (SQLEXPRESS)`

If you prefer connecting with a fixed port instead of an instance name, set TCP port `1433` in the TCP/IP properties and restart the service again.

## 3. Create the database

Connect with SSMS to:

- `localhost\\SQLEXPRESS`, or
- `localhost,1433` if you configured a fixed TCP port

Run:

```sql
CREATE DATABASE pricify_db;
GO
```

## 4. Create an application login

Run:

```sql
USE master;
GO
CREATE LOGIN pricify WITH PASSWORD = 'pricify2026';
GO

USE pricify_db;
GO
CREATE USER pricify FOR LOGIN pricify;
GO
ALTER ROLE db_owner ADD MEMBER pricify;
GO
```

You can replace `pricify` and the password with your preferred values, then copy the same values into the backend `.env`.

## 5. Backend environment

Default local `.env` values now support SQL Server Express named instances:

```env
DB_HOST=localhost
DB_INSTANCE=SQLEXPRESS
DB_PORT=
DB_USERNAME=pricify
DB_PASSWORD=pricify2026
DB_DATABASE=pricify_db
DB_SYNCHRONIZE=true
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

If you configured SQL Server Express to use a fixed port instead, use:

```env
DB_HOST=localhost
DB_INSTANCE=
DB_PORT=1433
```

## 6. Run the project locally

Backend:

```powershell
cd C:\Users\ahmed mhenni\Desktop\mariott\contracting_backend
pnpm install
pnpm run start:dev
```

Frontend:

```powershell
cd C:\Users\ahmed mhenni\Desktop\mariott\contracting_frontend
pnpm install
pnpm run dev
```

Frontend URL: `http://localhost:5173`

Backend URL: `http://localhost:3000/api`

## 7. Optional database reset and seed

After the backend can connect successfully, you can initialize the schema and seed data with:

```powershell
cd C:\Users\ahmed mhenni\Desktop\mariott\contracting_backend
pnpm run db:reset
```

## 8. What changed in code

The backend now supports both connection styles:

- named instance via `DB_INSTANCE=SQLEXPRESS`
- fixed port via `DB_PORT=1433`

Docker can still keep using host plus port, while local SQL Server Express can use the named instance path.
