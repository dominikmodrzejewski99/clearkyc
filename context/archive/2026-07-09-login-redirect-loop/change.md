---
change_id: login-redirect-loop
title: Login bounces back to landing page instead of staying on cases/new
status: archived
created: 2026-07-09
updated: 2026-07-09
archived_at: 2026-07-09T21:17:47Z
---

## Notes

przy auth jak sie loguje to zamiast kierowac mnie do systemu i cases new to wracam na landing i musze jeszcze raz kliknac zaloguj sie

Możliwa regresja / niedokończony fragment poprzedniej zmiany `context/changes/post-login-redirect/` (status: impl_reviewed), która miała właśnie zaadresować przekierowanie po loginie na `cases/new`. Do zbadania: czy to session/token issue (np. redirect zanim auth state się ustali) czy routing guard cofa nieautoryzowanego usera zanim token zostanie zapisany.
