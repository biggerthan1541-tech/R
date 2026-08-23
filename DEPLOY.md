# Running Readiness on a server

Written to be followed by someone who is not a developer. You will paste some
commands into a terminal; you do not need to understand what they do.

**Where things live once this is done**

| Thing | Where |
|---|---|
| The site | `https://your-domain.com` |
| The database | On the server, on a Docker volume called `readiness-data` |
| Backups | `/data/backups` inside that same volume |
| Settings and secrets | `/opt/readiness/.env` on the server |
| Deploy button | GitHub → **Actions** → **Deploy** → *Run workflow* |

---

## Part 1 — One-time setup (about 30 minutes)

### 1. Get a server

Sign up at **hetzner.com/cloud** and create a server:

- Type: **CX22** (about €3.79 / month)
- Image: **Ubuntu 24.04**
- Add your SSH key when asked. If you do not have one, run `ssh-keygen -t ed25519`
  on your own machine first and paste the contents of `~/.ssh/id_ed25519.pub`.

Write down the server's **IP address**.

### 2. Point your domain at it

At your domain registrar, add an **A record** pointing your chosen name (for
example `readiness.yourcompany.com`) at the server's IP address. Wait a few
minutes for it to take effect.

> Without this, HTTPS cannot be set up — the certificate authority has to be able
> to look up your name and reach your server.

### 3. Prepare the server

Connect to it:

```bash
ssh root@YOUR_SERVER_IP
```

Paste this whole block. It installs Docker and creates the folder the app lives in:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/readiness
```

Still on the server, generate your signing key and keep the output:

```bash
openssl rand -hex 32
```

That long string is your `SESSION_SECRET`. Treat it like a password.

> Changing it later signs everyone out and breaks every client link you have
> already shared, so set it once and leave it alone.

### 4. Tell GitHub how to reach the server

In GitHub, go to **Settings → Secrets and variables → Actions**, and add four
secrets with **New repository secret**:

| Name | Value |
|---|---|
| `SSH_HOST` | Your server's IP address |
| `SSH_USER` | `root` |
| `SSH_PRIVATE_KEY` | The contents of your **private** key file (`~/.ssh/id_ed25519`) — the whole thing, including the `BEGIN` and `END` lines |
| `ENV_FILE` | The block below, filled in |

`ENV_FILE` contents:

```
SESSION_SECRET=paste-the-long-string-from-step-3
PUBLIC_URL=https://readiness.yourcompany.com
READINESS_DOMAIN=readiness.yourcompany.com
NODE_ENV=production
```

> `PUBLIC_URL` includes `https://`. `READINESS_DOMAIN` does not. Caddy needs the
> bare name to request your certificate.

### 5. Deploy

GitHub → **Actions** → **Deploy** → **Run workflow**. In the panel that opens,
make sure the branch selector shows the branch your code is on, leave the tag box
**empty**, and press **Run workflow**.

> Leaving the tag empty deploys whatever is on the branch you selected. You only
> type something in that box when you are deliberately going back to an older
> version.

It takes two or three minutes. The last step checks your real address and fails
loudly if the site is not answering, so a green tick means it genuinely worked.

> The application image is private to your repository. The deploy hands your
> server a short-lived token for that one pull and logs it out afterwards, so no
> permanent registry password ends up sitting on the machine.

### 6. Create your login

Open `https://readiness.yourcompany.com`. Choose **Set up your MSP**, enter your
company name, your name, your email, and a password of at least 12 characters.
That first account is the owner and can add colleagues under **People**.

> **Signup is currently open**, so anyone who finds the address can create their
> own practice. To close it, add `SIGNUP_INVITE_CODE=some-phrase` to the
> `ENV_FILE` secret and deploy again. Everyone signing up then needs that phrase.

---

## Part 2 — Everyday tasks

### Deploy an update

GitHub → **Actions** → **Deploy** → **Run workflow**.

That is the whole process. It backs up the database first, swaps in the new
version, and checks the site is answering afterwards.

**To undo a bad update:** run **Deploy** again, and in the *tag* box type the
12-character code of the version you want. Every CI run prints its deployable
tags in the run summary — open Actions → CI → the run you want, and the codes are
at the bottom.

### Take a backup, and get it off the server

Backups are written to `/opt/readiness/backups` on the server — a normal folder,
not hidden inside Docker — so you can copy them straight to your own computer.

**On the server**, take the backup:

```bash
ssh root@YOUR_SERVER_IP "cd /opt/readiness && docker compose exec -T app npm run backup"
```

It prints something like:

```
Backed up to /backups/readiness-2026-08-23T17-04-11.db
  readiness-2026-08-23T17-04-11.db  0.42 MB  schema v2  integrity ok
```

**On your own computer**, pull it down. This is the command that matters — a
backup still sitting on the server is not protection against losing the server:

```bash
scp root@YOUR_SERVER_IP:/opt/readiness/backups/*.db ~/Desktop/
```

To fetch just the most recent one:

```bash
scp root@YOUR_SERVER_IP:"$(ssh root@YOUR_SERVER_IP 'ls -t /opt/readiness/backups/*.db | head -1')" ~/Desktop/
```

> `/backups` inside the container is `/opt/readiness/backups` on the server.
> They are the same folder.

Do this before anything you are nervous about, and on a routine you will
actually keep. Old ones are safe to delete once you have newer copies stored
somewhere else.

### Restore a backup

This replaces all current data with the contents of the backup. Take a fresh
backup first if there is anything you want to keep.

If the file is already on the server:

```bash
ssh root@YOUR_SERVER_IP
cd /opt/readiness
docker compose stop app
docker compose run --rm app npm run restore -- /backups/THE-FILE-YOU-WANT.db
docker compose start app
```

If you are restoring a copy from your own computer — a rebuilt server, or the
old one is gone — send it up first:

```bash
scp ~/Desktop/readiness-2026-08-23T17-04-11.db root@YOUR_SERVER_IP:/opt/readiness/backups/
```

then run the same commands above against that filename.

It refuses anything that is not a valid Readiness database, and it keeps the
database it replaced (as a file ending `.replaced-…`), so restoring the wrong
file can itself be undone.

---

## Part 3 — If the site is down

Work through these in order. Most outages stop at step 2.

**1. Check whether it is really down.** Open
`https://readiness.yourcompany.com/health` in a browser. If it shows
`{"status":"ok",...}` the app is fine and the problem is elsewhere — your
network, or the specific page you were on.

**2. Restart it.** Fixes the large majority of problems.

```bash
ssh root@YOUR_SERVER_IP
cd /opt/readiness
docker compose restart
```

Wait thirty seconds and try the site again.

**3. Look at what it is complaining about.**

```bash
docker compose logs --tail=50 app
```

Common messages and what they mean:

| Message | What it means | Fix |
|---|---|---|
| `Missing required configuration: SESSION_SECRET` | A setting did not reach the server | Check the `ENV_FILE` secret in GitHub, then deploy again |
| `PUBLIC_URL is required in production` | Same | Same |
| `EADDRINUSE` | Something else is already using the port | `docker compose down` then `docker compose up -d` |
| Nothing at all, container keeps restarting | Usually out of disk | `df -h`, then delete old backups |

**4. Check the certificate.** If the browser warns about security rather than
failing to connect:

```bash
docker compose logs --tail=30 caddy
```

Certificates renew automatically. If it cannot renew, the usual cause is the DNS
record no longer pointing at this server.

**5. Roll back.** If it broke immediately after a deploy, deploy the previous
version: **Actions → Deploy → Run workflow**, with the previous 12-character code
in the tag box. Those codes are in each CI run's summary.

**6. Rebuild from scratch.** Worst case, the data is on the volume, not the
container. Recreating the server and running the deploy again restores service;
restoring your most recent off-server backup restores the data.

---

## What this setup deliberately does not do

Worth knowing before you rely on it for something bigger than demos.

- **One server, one copy.** If it fails, the site is down until you fix it or
  rebuild. There is no automatic failover.
- **Backups are manual.** Nothing runs them on a schedule yet, and nothing copies
  them off the machine for you. Both are worth adding before real client data
  depends on this.
- **The app runs on exactly one container.** SQLite is a single file and two
  processes writing to it will corrupt it. Do not scale it up. When you outgrow
  one server, the database moves to PostgreSQL with no change to the schema.
- **You own the operating system.** Run `apt update && apt upgrade` on the server
  every so often.
