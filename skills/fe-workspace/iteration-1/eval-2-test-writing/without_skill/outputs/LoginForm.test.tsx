import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LoginForm } from '@/components/LoginForm';
import { handlers } from './handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('LoginForm', () => {
  const mockOnSuccess = vi.fn();

  afterEach(() => {
    mockOnSuccess.mockClear();
  });

  it('이메일과 비밀번호 입력 필드를 렌더링한다', () => {
    render(<LoginForm onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('폼에 aria-label이 설정되어 있다', () => {
    render(<LoginForm onSuccess={mockOnSuccess} />);

    expect(screen.getByRole('form', { name: '로그인' })).toBeInTheDocument();
  });

  it('이메일에 @가 없으면 로그인 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'invalid-email');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');

    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
  });

  it('비밀번호가 8자 미만이면 로그인 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'short');

    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
  });

  it('유효한 이메일과 비밀번호 입력 시 로그인 버튼이 활성화된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');

    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });

  it('로그인 성공 시 onSuccess 콜백이 user 데이터와 함께 호출된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith({ id: '1', name: 'Test User' });
    });
  });

  it('로그인 요청 중 버튼 텍스트가 "로그인 중..."으로 변경되고 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(screen.getByRole('button', { name: '로그인 중...' })).toBeDisabled();

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('로그인 실패 시 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'wrong@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('로그인 실패 시 이메일 입력에 aria-invalid가 true로 설정된다', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'wrong@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('네트워크 오류 발생 시 에러 메시지를 표시한다', async () => {
    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.error();
      }),
    );

    const user = userEvent.setup();
    render(<LoginForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('placeholder 텍스트가 올바르게 표시된다', () => {
    render(<LoginForm onSuccess={mockOnSuccess} />);

    expect(screen.getByPlaceholderText('이메일을 입력하세요')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('비밀번호를 입력하세요')).toBeInTheDocument();
  });
});
