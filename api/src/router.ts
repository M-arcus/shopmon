import { Router } from "itty-router";
import teamRouter from './api/team';
import { JsonResponse } from "./api/common/response";
import { Hono } from "hono";
import { sentry } from './middleware/sentry';
import { trpcServer } from "./middleware/trpc";
import { appRouter } from './trpc/router'

const router = Router();

export type Bindings = {
    MAIL_ACTIVE: 'true' | 'false';
    MAIL_FROM: string;
    MAIL_FROM_NAME: string;

    MAIL_DKIM_PRIVATE_KEY: string | undefined;
    MAIL_DKIM_DOMAIN: string;
    MAIL_DKIM_SELECTOR: string;

    FRONTEND_URL: string;
    SENTRY_DSN: string;
    PAGESPEED_API_KEY: string;
    APP_SECRET: string;
    DISABLE_REGISTRATION: boolean;

    // cloudflare bindings
    kvStorage: KVNamespace;
    SHOPS_SCRAPE: DurableObjectNamespace;
    PAGESPEED_SCRAPE: DurableObjectNamespace;
    USER_SOCKET: DurableObjectNamespace;
    FILES: R2Bucket;
    shopmonDB: D1Database;
    sendMail: SendEmail;
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', sentry());
app.use(
    '/trpc/*',
    trpcServer({ router: appRouter }),
)

router.all('/api/team/*', teamRouter.handle);

app.get('/api/ws', async (c) => {
    const authToken = new URL(c.req.url).searchParams.get('auth_token');

    if (!authToken) {
        return new Response('Invalid token', { status: 400 });
    }

    const token = await c.env.kvStorage.get(authToken);

    if (token === null) {
        return new Response('Invalid token', { status: 400 });
    }

    const data = JSON.parse(token) as { id: number };

    return c.env.USER_SOCKET.get(c.env.USER_SOCKET.idFromName(data.id.toString())).fetch(c.req.raw)
});

router.all('*', () => new JsonResponse({ message: 'Not found' }, 404));

app.all('*', async (c) => {
    return await router.handle(c.req.raw, c.env, c.executionCtx, c.get('sentry'))
})

export default app;

