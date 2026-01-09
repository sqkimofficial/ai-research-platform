# Security Headers - Production Deployment Guide

## ✅ Development Testing Results

All security headers are correctly configured for development:
- ✓ Content-Security-Policy: Present with relaxed localhost settings
- ✓ X-Frame-Options: SAMEORIGIN (relaxed for dev)
- ✓ X-Content-Type-Options: nosniff
- ✓ Referrer-Policy: no-referrer-when-downgrade
- ✓ X-XSS-Protection: 1; mode=block
- ✓ Permissions-Policy: Empty (allows all for testing)
- ✓ Strict-Transport-Security: NOT present (correct for HTTP/dev)

---

## 🚀 Production Deployment Checklist

### Step 1: Set Environment Variables

Add these to your production environment (`.env` file or hosting platform):

```bash
# Required: Set Flask to production mode
FLASK_ENV=production

# Required: Set your production frontend URLs (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Required: Auth0 configuration (should already be set)
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Optional: S3 bucket (if using for images)
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_REGION=us-east-2
```

**Important Notes:**
- `ALLOWED_ORIGINS` must include ALL production frontend URLs
- Use `https://` (not `http://`) for all production origins
- No trailing slashes in URLs (e.g., `https://app.example.com` not `https://app.example.com/`)

### Step 2: Configure HTTPS

Security headers (especially HSTS) require HTTPS. Ensure:

1. **SSL Certificate is installed** on your server/reverse proxy
2. **All HTTP traffic redirects to HTTPS** (301 redirect)
3. **Reverse proxy forwards HTTPS correctly** (if using nginx/Apache)

#### For Nginx (if using reverse proxy):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Forward to Flask app
    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;  # CRITICAL for HSTS
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

**Critical:** The `X-Forwarded-Proto: https` header is required for Flask to detect HTTPS and set HSTS correctly.

### Step 3: Verify Headers in Production

After deployment, test your headers:

```bash
# Test with curl
curl -I https://yourdomain.com/api/health

# Or use online tools:
# - https://securityheaders.com
# - https://observatory.mozilla.org
```

**Expected Production Headers:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: ...` (strict, no localhost)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy: geolocation=(), microphone=(), ...`

### Step 4: Test CSP (Content Security Policy)

After deployment, check browser console for CSP violations:

1. Open browser DevTools → Console
2. Look for CSP violation warnings
3. If you see violations, you may need to adjust CSP in `backend/utils/security_headers.py`

**Common CSP Issues:**
- External scripts not allowed → Add domain to `script-src`
- External stylesheets → Add domain to `style-src`
- External images → Add domain to `img-src`
- WebSocket connections → Add to `connect-src`

### Step 5: HSTS Preload (Optional but Recommended)

To protect users on their first visit, submit your domain to HSTS preload:

1. **Ensure your HSTS header includes `preload`:**
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```

2. **Submit to HSTS Preload List:**
   - Visit: https://hstspreload.org
   - Enter your domain
   - Follow their requirements (must have `includeSubDomains` and `preload`)

3. **Wait for inclusion** (can take weeks/months)

### Step 6: Monitor and Adjust

1. **Monitor CSP violations** in production logs
2. **Test all features** to ensure CSP doesn't break functionality
3. **Adjust CSP directives** if needed (but keep them strict)

---

## 🔍 Troubleshooting

### HSTS Not Appearing

**Problem:** `Strict-Transport-Security` header is missing in production

**Solutions:**
1. Check that `FLASK_ENV=production` is set
2. Verify request is over HTTPS (not HTTP)
3. If behind reverse proxy, ensure `X-Forwarded-Proto: https` header is set
4. Check Flask `request.is_secure` returns `True`

### CSP Blocking Resources

**Problem:** Browser console shows CSP violations

**Solutions:**
1. Check which resource is blocked (script, style, image, etc.)
2. Add the domain to the appropriate CSP directive in `security_headers.py`
3. For third-party services, add their domains:
   - Analytics: Add to `script-src` and `connect-src`
   - CDNs: Add to `script-src`, `style-src`, `font-src`, etc.
   - APIs: Add to `connect-src`

### CORS Errors

**Problem:** Frontend can't connect to backend

**Solutions:**
1. Verify `ALLOWED_ORIGINS` includes your frontend URL
2. Check that frontend URL matches exactly (no trailing slash, correct protocol)
3. Ensure `FLASK_ENV=production` is set

---

## 📋 Quick Reference

### Environment Variables for Production

```bash
FLASK_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AWS_S3_BUCKET_NAME=your-bucket-name  # Optional
```

### Testing Commands

```bash
# Test headers
curl -I https://yourdomain.com/api/health

# Test with verbose output
curl -v https://yourdomain.com/api/health

# Test specific header
curl -I https://yourdomain.com/api/health | grep Strict-Transport-Security
```

### Online Security Testing Tools

- **Security Headers:** https://securityheaders.com
- **Mozilla Observatory:** https://observatory.mozilla.org
- **SSL Labs:** https://www.ssllabs.com/ssltest/ (for SSL/TLS testing)

---

## ✅ Final Checklist

Before going live, verify:

- [ ] `FLASK_ENV=production` is set
- [ ] `ALLOWED_ORIGINS` includes all production frontend URLs
- [ ] HTTPS is configured and working
- [ ] HTTP redirects to HTTPS (301 redirect)
- [ ] Reverse proxy forwards `X-Forwarded-Proto: https` header
- [ ] All security headers are present in responses
- [ ] HSTS header appears (only over HTTPS)
- [ ] CSP doesn't block any legitimate resources
- [ ] No CSP violations in browser console
- [ ] CORS works correctly with frontend
- [ ] Tested all major features after deployment

---

## 📝 Notes

- **HSTS max-age:** Currently set to 1 year (31536000 seconds). This is standard and recommended.
- **CSP strictness:** Production CSP is strict. If you need to add external domains, do so carefully and only for trusted sources.
- **Development vs Production:** Headers automatically adjust based on `FLASK_ENV`. No code changes needed between environments.

