import { ReactNode } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { paperTheme } from '../theme';
import { colors } from '../theme/tokens';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <SafeAreaView
          edges={['top', 'left', 'right']}
          style={{ flex: 1, backgroundColor: colors.canvas }}
        >
          {children}
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
