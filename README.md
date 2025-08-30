# Grievance Demo (Static) — EC2 host + S3 storage (No backend)

**What this is:** A *basic demo* web app with **no backend**. You host these static files on **EC2**. The app writes JSON and file uploads **directly to S3** from the browser using your AWS credentials (entered in a Settings modal and stored in localStorage).

> ⚠️ **Security Warning**: This is for demonstration only. Do **not** expose long‑lived IAM keys publicly. For production, use Cognito/Federation or a minimal API that generates presigned URLs.

---

## 1) S3 Setup

1. Create a bucket (e.g., `my-grievances-bucket`) in your region (e.g., `ap-south-1`).
2. Enable **CORS** on the bucket (Permissions → CORS). Example:

```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "PUT", "HEAD", "POST"],
  "AllowedOrigins": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

> Restrict `AllowedOrigins` to your EC2 domain/IP in real use.

3. Create an **IAM user** with a policy restricted to your bucket/prefix:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:ListBucket","s3:GetObject"],
    "Resource": [
      "arn:aws:s3:::my-grievances-bucket",
      "arn:aws:s3:::my-grievances-bucket/*"
    ]
  }]
}
```

4. (Optional) Use a dedicated prefix, e.g., `grievances/`.

---

## 2) EC2 setup (host static site)

1. Launch a small EC2 (Amazon Linux 2023), open ports 80/443 (and 22 for SSH).
2. Install Nginx:
```bash
sudo dnf update -y
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```
3. Copy site files to server:
```bash
# From your laptop (adjust key/IP/path)
scp -i mykey.pem -r . ec2-user@YOUR_PUBLIC_IP:~/site
```
4. Serve via Nginx:
```bash
sudo tee /etc/nginx/conf.d/grievance.conf >/dev/null <<'EOF'
server {
  listen 80;
  server_name YOUR_DOMAIN_OR_IP;
  root /home/ec2-user/site;
  index index.html;
  location / {
    try_files $uri $uri/ =404;
  }
}
EOF

sudo nginx -t
sudo systemctl reload nginx
```
5. Open `http://YOUR_DOMAIN_OR_IP`

---

## 3) Using the app

- Click **Settings** (top right), enter:
  - Region (e.g., `ap-south-1`)
  - Bucket (e.g., `my-grievances-bucket`)
  - Prefix (e.g., `grievances/`)
  - Access Key ID / Secret Access Key (for the restricted IAM user)
- **Submit Grievance**: name, email, category, description, and optional files.
  - App uploads files to `grievances/<ID>/files/...`
  - App uploads metadata JSON to `grievances/<ID>/record.json`
- **Latest Submissions** shows a simple list by scanning `record.json` keys.

---

## 4) Notes & next steps

- Replace demo auth with **Cognito** or an **API** issuing **presigned URLs**.
- Lock down S3 CORS `AllowedOrigins` and IAM more tightly.
- Add detail view (download and display `record.json`) and file links.
- Add pagination using `ContinuationToken` with ListObjectsV2.
