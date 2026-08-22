import React, { forwardRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { cn } from './cn';

// react-native-web renders <TextInput> as a real <input>, which gets the browser's
// default focus outline. Strip it so our own focus state is the only thing visible.
const WEB_NO_OUTLINE = Platform.OS === 'web'
  ? { outlineWidth: 0, outlineStyle: 'none', outlineColor: 'transparent' }
  : null;

export const Input = forwardRef(function Input({ className, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  // If the caller passed `border-0` or `border-transparent` (e.g. inside an icon wrapper
  // that draws its own border), don't add our own focused/idle border classes.
  const callerSuppressesBorder = typeof className === 'string'
    && /\bborder-0\b|\bborder-transparent\b/.test(className);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#94A3B8"
      {...rest}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      className={cn(
        'bg-card rounded-xl px-4 py-3 text-base text-text',
        callerSuppressesBorder ? '' : 'border',
        callerSuppressesBorder ? '' : (focused ? 'border-primary' : 'border-border'),
        className,
      )}
      style={[
        WEB_NO_OUTLINE,
        focused && !callerSuppressesBorder
          ? { shadowColor: '#00008B', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }
          : null,
        rest.style,
      ]}
    />
  );
});

export function Label({ className, children, required }) {
  return (
    <Text className={cn('text-sm font-semibold text-text mb-2', className)}>
      {children}
      {required ? <Text className="text-danger"> *</Text> : null}
    </Text>
  );
}

export function FormField({ label, required, error, hint, children, className }) {
  return (
    <View className={cn('mb-4', className)}>
      {label ? <Label required={required}>{label}</Label> : null}
      {children}
      {error ? (
        <Text className="text-danger text-xs mt-1">{error}</Text>
      ) : hint ? (
        <Text className="text-text-muted text-xs mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}
