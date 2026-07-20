import type { ThemeConfig } from 'antd';

/**
 * AES brand palette — sourced from the corporate site (aes.co.zw).
 * Primary green #6DBE45, charcoal #222429, Roboto typography.
 */
export const AES = {
  green: '#6DBE45',
  greenDark: '#579a34',
  greenSoft: '#eef7e6',
  charcoal: '#222429',
  charcoalSoft: '#2b2e35',
  ink: '#222429',
} as const;

const FONT_FAMILY =
  "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Login-screen backdrop — charcoal fading into brand green. */
export const AES_AUTH_BG =
  'linear-gradient(135deg, #222429 0%, #2c3a22 55%, #3f5a2a 100%)';

export const aesTheme: ThemeConfig = {
  token: {
    colorPrimary: AES.green,
    colorInfo: AES.green,
    colorLink: AES.greenDark,
    colorLinkHover: AES.green,
    colorTextBase: AES.ink,
    borderRadius: 8,
    fontFamily: FONT_FAMILY,
    controlHeight: 38,
  },
  components: {
    Layout: {
      siderBg: AES.charcoal,
      triggerBg: AES.charcoalSoft,
      headerBg: '#ffffff',
      bodyBg: '#f4f6f8',
      footerBg: '#f4f6f8',
    },
    Menu: {
      darkItemBg: AES.charcoal,
      darkPopupBg: AES.charcoal,
      darkSubMenuItemBg: AES.charcoalSoft,
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(109,190,69,0.16)',
      darkItemSelectedBg: AES.green,
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Button: {
      primaryShadow: 'none',
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      headerBg: AES.greenSoft,
      headerColor: '#33421f',
    },
  },
};
