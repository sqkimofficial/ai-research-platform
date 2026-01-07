# Redis Cloud Setup Guide

This guide walks you through setting up Redis Cloud (production-ready Redis) and configuring your application to use it.

## Step 1: Create a Redis Cloud Account

1. Go to [Redis Cloud](https://redis.com/try-free/)
2. Click **"Start Free"** or **"Sign Up"**
3. Fill in your information:
   - Email address
   - Password
   - Name
   - Company (optional)
4. Verify your email address if prompted
5. Log in to the Redis Cloud console

## Step 2: Create a Subscription

1. Once logged in, you'll be prompted to create a subscription
2. For free tier (good for development/testing):
   - Select **"Free"** plan
   - 30MB storage
   - No credit card required
3. For production (paid tier):
   - Choose a paid plan (e.g., "Fixed", "Flexible")
   - More storage and features
   - Credit card required

## Step 3: Create a Database

1. In the Redis Cloud dashboard, click **"Databases"** in the left sidebar
2. Click **"New Database"** or **"+"** button
3. Configure your database:
   - **Name**: Give it a name (e.g., "ai-research-platform")
   - **Region**: Choose the closest region to your backend server
     - US East (AWS)
     - US West (AWS)
     - EU (AWS)
     - etc.
   - **Memory limit**: 
     - Free tier: 30MB (default)
     - Paid: Choose based on your needs
4. Click **"Activate"** or **"Create Database"**

## Step 4: Get Connection Details

Once your database is created, follow these steps to find all connection details:

### Method 1: Database Overview Page

1. **Click on your database name** in the "Databases" list to open the database details page
2. Look for a section called **"Configuration"**, **"Endpoints"**, or **"Connection"**
3. You should see:
   - **Public endpoint** (hostname) - This is your `REDIS_HOST`
   - **Port** - This is your `REDIS_PORT`
   
### Method 2: Find Password (If not visible on main page)

The password is often in a separate security section:

1. While on the database details page, look for tabs or sections:
   - **"Security"** tab
   - **"Access Control"** section
   - **"Data Access Control"** (as shown in your screenshot)
   - **"Endpoint & Security"** section

2. Look for:
   - **"Default user password"** or **"Password"**
   - Click **"Show"**, **"Reveal"**, or **copy icon** to view/copy the password

### Method 3: Using Redis CLI Connection String

If you see a Redis CLI connection prompt or string:

1. The connection string format is usually:
   ```
   redis-cli -h <hostname> -p <port> -a <password>
   ```
   Or:
   ```
   redis://default:<password>@<hostname>:<port>
   ```

2. Extract from connection string:
   - Everything after `-h` or `@` and before `:` = **REDIS_HOST**
   - Number after `-p` or after hostname `:` and before password `@` = **REDIS_PORT**
   - Everything after `-a` or after `default:` and before `@` = **REDIS_PASSWORD**

3. **Username** for Redis Cloud is usually:
   - `default` (most common)
   - Or your custom username if you created one

### Method 4: Database Endpoint Details

1. On the database details page, scroll down or look for:
   - **"Endpoint"** section
   - **"Connection Details"** section
   - **"Access & Security"** section

2. You might see:
   ```
   Public endpoint: redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com:12345
   ```
   In this case:
   - **REDIS_HOST** = `redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com`
   - **REDIS_PORT** = `12345` (the number after the colon)

3. For password, check **"Security"** or **"Access Control"** sections

### What Each Field Should Look Like:

- **REDIS_HOST**: `redis-12138.c17.us-east-1-4.ec2.cloud.redislabs.com`
- **REDIS_PORT**: 12138
- **REDIS_PASSWORD**: Q6kF3FCdKk9BhMcmT2dkuaILmVHr2tQn
- **REDIS_DB**: Always `0` for Redis Cloud (default database)
- **Username**: Usually `default` (we don't need this as a separate env var)

### Still Can't Find It?

If you still can't see the port or password:

1. **Check for a "View" or "Show Details" button** on the database card
2. **Look for a connection icon** or "Connect" button
3. **Try clicking "Edit" or "Configuration"** on the database
4. **Check the "Endpoint & Security" tab** specifically
5. **Look in "Access Control & Security"** section (which you can see in your sidebar)

## Step 5: Configure Environment Variables

Add these to your `.env` file in the `backend/` directory:

```bash
# Redis Cloud Configuration
REDIS_HOST=redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-actual-password-here
REDIS_DB=0

# Optional: Customize TTLs (seconds)
REDIS_TTL_DOCUMENTS=300    # 5 minutes
REDIS_TTL_METADATA=600     # 10 minutes
REDIS_TTL_VERSION=60       # 1 minute
```

**Important Notes:**
- Replace `REDIS_HOST` with your actual Public endpoint (without `redis://` prefix)
- Replace `REDIS_PORT` with your actual port number
- Replace `REDIS_PASSWORD` with your actual password
- `REDIS_DB` should usually be `0` (default database)

## Step 6: Install Redis Python Client

Make sure you have the redis client installed:

```bash
cd backend
source venv/bin/activate  # On macOS/Linux (if using venv)
# or
.\venv\Scripts\activate  # On Windows

# Install redis (note: use quotes to prevent shell from interpreting >=)
pip install "redis>=5.0.0"

# Or install all requirements (which includes redis)
pip install -r requirements.txt
```

**Note:** Always use quotes around package specifications with `>=` to prevent shell errors in zsh/bash.

## Step 7: Test the Connection

1. Start your Flask backend:
   ```bash
   cd backend
   python app.py
   # or
   flask run
   ```

2. Check the logs for:
   ```
   [REDIS] Connecting to Redis: redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com:12345
   [REDIS] Connected successfully
   ```

3. If you see connection errors:
   - Double-check your `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`
   - Ensure your database is **Active** in Redis Cloud
   - Check if your IP needs to be whitelisted (see Step 8)

## Step 8: Configure IP Whitelist (if needed)

Some Redis Cloud setups require IP whitelisting:

1. In Redis Cloud, go to your database settings
2. Navigate to **"Access Control & Security"** or **"Security"**
3. Look for **"IP Whitelist"** or **"Allowed IPs"**
4. Add your server's IP address:
   - For local development: `0.0.0.0/0` (allows all IPs - not recommended for production)
   - For production: Add your server's specific IP address
5. Save changes

**Note:** Free tier typically allows all IPs by default. Paid tiers may require specific IPs.

## Step 9: Verify Caching is Working

1. Make a request to your API (e.g., GET `/api/document/research-documents?project_id=xxx`)
2. Check backend logs:
   - First request: `[REDIS] Cache miss, fetching from MongoDB`
   - Second request (within 5 minutes): `[REDIS] Cache hit`
3. Check response times:
   - Cache miss: ~200-500ms (MongoDB query)
   - Cache hit: ~1-5ms (Redis query)

## Troubleshooting

### Connection Refused
- Verify `REDIS_HOST` and `REDIS_PORT` are correct
- Ensure database is Active in Redis Cloud
- Check if IP whitelist is blocking your IP

### Authentication Failed
- Verify `REDIS_PASSWORD` is correct
- Check if password has special characters that need escaping
- Ensure username is correct (usually "default")

### Connection Timeout
- Check your firewall settings
- Verify the Redis Cloud database is in the correct region
- Try pinging the hostname: `ping redis-xxxxx.xxx.xxx.cloud.redislabs.com`

### SSL/TLS Connection (if required)
If your Redis Cloud instance requires SSL/TLS:
- You may need to update `backend/services/redis_service.py` to use SSL
- Some Redis Cloud plans require SSL connections

## Production Considerations

1. **Password Security**: 
   - Never commit `.env` files to git
   - Use environment variables in production
   - Rotate passwords regularly

2. **Backup**: 
   - Redis Cloud provides automated backups on paid plans
   - Consider backup strategy for production data

3. **Monitoring**:
   - Monitor Redis Cloud dashboard for usage
   - Set up alerts for memory/connection limits

4. **Scaling**:
   - Start with free tier for development
   - Upgrade to paid tier before production
   - Monitor usage and scale as needed

## Quick Reference

### Redis Cloud Dashboard
- URL: https://app.redislabs.com
- Login with your account credentials

### Environment Variables Template
```bash
REDIS_HOST=your-hostname.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-password
REDIS_DB=0
```

### Connection String Format
Redis Cloud provides connection strings in format:
```
redis://default:password@hostname:port
```

But we use separate variables:
- `REDIS_HOST` = hostname (without `redis://`)
- `REDIS_PORT` = port
- `REDIS_PASSWORD` = password
- `REDIS_DB` = database number (usually 0)

