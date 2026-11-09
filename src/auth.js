import { auth } from 'express-openid-connect';

export const MOCK_USERS = [
  {
    id: 'user:alice',
    name: 'Alice Manager',
    email: 'alice@acme.corp',
    role: 'manager',
    department: 'engineering',
    description: 'Engineering Manager (Role: Manager, Dept: Engineering)',
  },
  {
    id: 'user:bob',
    name: 'Bob Engineer',
    email: 'bob@acme.corp',
    role: 'employee',
    department: 'engineering',
    description: 'Software Engineer (Role: Employee, Dept: Engineering)',
  },
  {
    id: 'user:carol',
    name: 'Carol Finance Lead',
    email: 'carol@acme.corp',
    role: 'manager',
    department: 'finance',
    description: 'Finance Manager (Role: Manager, Dept: Finance)',
  },
  {
    id: 'user:dave',
    name: 'Dave Marketer',
    email: 'dave@acme.corp',
    role: 'employee',
    department: 'marketing',
    description: 'Marketing Associate (Role: Employee, Dept: Marketing)',
  },
];

/**
 * Configure Auth0 OpenID Connect or Mock Authentication middleware.
 */
export function setupAuth(app) {
  const authMode = process.env.AUTH_MODE || 'mock';

  if (authMode === 'auth0') {
    const config = {
      authRequired: false,
      auth0Logout: true,
      secret: process.env.SESSION_SECRET || 'a_long_random_session_secret_32_characters_minimum',
      baseURL: process.env.AUTH0_BASE_URL || 'http://localhost:3000',
      clientID: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
      routes: {
        login: '/login',
        logout: '/logout',
        callback: '/callback',
      },
    };

    app.use(auth(config));

    // Middleware mapping Auth0 identity to FGA user ID
    app.use((req, res, next) => {
      if (req.oidc && req.oidc.isAuthenticated()) {
        const oidcUser = req.oidc.user;
        // Map email or sub to FGA user ID
        const username = oidcUser.nickname || oidcUser.email?.split('@')[0] || oidcUser.sub;
        req.user = {
          id: `user:${username.toLowerCase()}`,
          name: oidcUser.name || username,
          email: oidcUser.email,
          authType: 'auth0',
        };
      } else {
        req.user = null;
      }
      next();
    });
  } else {
    // MOCK AUTHENTICATION MODE
    // Uses cookie/header or defaults to Alice
    let currentMockUserId = 'user:alice';

    app.use((req, res, next) => {
      // Check query param or header for easy switching
      const switchUser = req.query.asUser || req.headers['x-mock-user'];
      if (switchUser && MOCK_USERS.some((u) => u.id === switchUser)) {
        currentMockUserId = switchUser;
      }

      const activeUser = MOCK_USERS.find((u) => u.id === currentMockUserId) || MOCK_USERS[0];
      req.user = {
        ...activeUser,
        authType: 'mock',
      };
      req.oidc = {
        isAuthenticated: () => true,
        user: activeUser,
      };

      next();
    });

    // Endpoint to switch mock user via API
    app.post('/api/auth/mock-switch', (req, res) => {
      const { userId } = req.body;
      const target = MOCK_USERS.find((u) => u.id === userId);
      if (!target) {
        return res.status(400).json({ error: `User ${userId} not found in mock directory.` });
      }
      currentMockUserId = target.id;
      return res.json({ success: true, activeUser: target });
    });
  }

  // Common endpoint to get current authenticated user profile
  app.get('/api/auth/me', (req, res) => {
    res.json({
      authMode,
      isAuthenticated: Boolean(req.user),
      user: req.user,
      availableMockUsers: authMode === 'mock' ? MOCK_USERS : [],
    });
  });
}
