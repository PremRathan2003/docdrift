import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { GuestOnly, RequireAuth } from './components/RouteGuards';
import './index.css';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';
import { PullRequestPage } from './pages/PullRequestPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { RepositoryPage } from './pages/RepositoryPage';
import { SuggestionPage } from './pages/SuggestionPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/repositories', element: <RepositoriesPage /> },
          { path: '/repositories/:id', element: <RepositoryPage /> },
          { path: '/pull-requests/:id', element: <PullRequestPage /> },
          { path: '/suggestions/:id', element: <SuggestionPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
