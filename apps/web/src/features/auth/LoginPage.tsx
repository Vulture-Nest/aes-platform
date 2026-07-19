import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useLoginMutation } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { tokensReceived } from './authSlice';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const [login, { isLoading, error }] = useLoginMutation();

  if (user) {
    navigate('/', { replace: true });
  }

  const onFinish = async (values: { email: string; password: string }) => {
    const tokens = await login(values).unwrap();
    dispatch(tokensReceived(tokens));
    navigate('/', { replace: true });
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          AES
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          Operations &amp; Finance
        </Typography.Paragraph>
        {error ? (
          <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Invalid credentials" />
        ) : null}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: 'email', message: 'Enter your email' }]}
          >
            <Input placeholder="you@aes.local" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isLoading}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
