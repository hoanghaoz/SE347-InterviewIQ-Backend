## Workflow when start to code first time in repo

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Change the .env file

```bash
cp .env.example .env
```

After that fill in the values.

### Step 3: Check missing environment variables

Run

```bash
npm run doctor
```

## Workflow when implement new feature

### Step 1: Always pull latest changes from remote

```bash
git pull origin main
```

### Step 2: Create new branch

```bash
git checkout -b <branch-name>
```
