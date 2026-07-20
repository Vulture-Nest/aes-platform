import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useLoginMutation } from '../../api/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { AES_AUTH_BG } from '../../theme';
import logoGreen from '../../assets/aes-logo-green.png';
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
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: AES_AUTH_BG,
        padding: 16,
      }}
    >
      <div style={{ width: 380 }}>
        <Card style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <img src={logoGreen} alt="AES" style={{ height: 46 }} />
          </div>
          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: 'center', marginBottom: 20 }}
          >
            Operations &amp; Finance — configuration console
          </Typography.Paragraph>
          {error ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="Invalid credentials"
            />
          ) : null}
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: 'email', message: 'Enter your email' }]}
          >
            <Input placeholder="admin@aes.local" autoComplete="username" />
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
        <div
          style={{
            textAlign: 'center',
            marginTop: 16,
            color: 'rgba(255,255,255,0.6)',
            fontSize: 12,
          }}
        >
          Airflow Environmental Solutions
        </div>
      </div>
    </div>
  );
}
