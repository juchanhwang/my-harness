import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as {
      email: string;
      password: string;
    };

    if (email === 'user@example.com' && password === 'password123') {
      return HttpResponse.json({
        user: { id: '1', name: 'Test User' },
      });
    }

    return HttpResponse.json(
      { message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 },
    );
  }),
];
