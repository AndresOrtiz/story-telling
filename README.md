# The Collective Story

A web app where up to 10 people build one story together by deciding moral dilemmas. Host, shared screen, players and spectators all use a browser on a laptop, tablet or phone.

## Run it

```
pnpm install
copy .env.example .env.local
pnpm dev
```

Open http://localhost:3000, create a room, and join from other browsers. No credentials are needed: with the fake keys in `.env.example` the app uses the built-in story, placeholder images and an embedded database in `.data/`.

To join from phones on the same network, open the app through the computer's address (for example `http://192.168.1.20:3000`) so that the QR code contains it, and start with `DEV_ORIGINS=192.168.1.20` so the development server accepts it.

## More

- `docs/design.md`: the design
- `docs/status.md`: what is tested, what is not, and how to go live
- `CLAUDE.md`: map, commands and rules for working on the code
