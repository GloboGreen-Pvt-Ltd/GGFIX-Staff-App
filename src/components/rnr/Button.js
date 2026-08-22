import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cn } from './cn';

function isTextChildren(children) {
  if (children == null) return false;
  if (typeof children === 'string' || typeof children === 'number') return true;
  if (Array.isArray(children)) {
    return children.every(
      (c) => c == null || typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean',
    );
  }
  return false;
}

const variantClasses = {
  default: 'bg-primary',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  outline: 'bg-card border border-primary',
  ghost: 'bg-transparent',
  destructive: 'bg-danger',
  muted: 'bg-border',
  soft: 'bg-primary/10',
};

const textVariantClasses = {
  default: 'text-white',
  primary: 'text-white',
  secondary: 'text-white',
  success: 'text-white',
  outline: 'text-primary',
  ghost: 'text-primary',
  destructive: 'text-white',
  muted: 'text-text',
  soft: 'text-primary',
};

const sizeClasses = {
  default: 'py-3.5 px-6 rounded-2xl',
  sm: 'py-2.5 px-4 rounded-xl',
  lg: 'py-4 px-8 rounded-2xl',
  pill: 'py-3.5 px-6 rounded-full',
  icon: 'h-11 w-11 rounded-full',
};

const shadowVariants = {
  default: { shadowColor: '#00008B', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  sm: { shadowColor: '#00008B', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  none: {},
};

export function Button({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  className,
  textClassName,
  rightIcon,
  leftIcon,
  elevated = true,
  fullWidth = false,
  children,
  ...rest
}) {
  const isDisabled = disabled || loading;
  const noShadowVariant = variant === 'ghost' || variant === 'outline' || variant === 'muted' || variant === 'soft';
  const shadow = elevated && !isDisabled && !noShadowVariant
    ? shadowVariants[size === 'sm' ? 'sm' : 'default']
    : shadowVariants.none;
  const spinColor =
    variant === 'outline' || variant === 'ghost' || variant === 'soft' || variant === 'muted'
      ? '#00008B'
      : '#fff';
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={[shadow, rest.style]}
      className={cn(
        'flex-row items-center justify-center active:opacity-80',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color={spinColor} />
      ) : (
        <>
          {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
          {isTextChildren(children) ? (
            <Text numberOfLines={1} className={cn('text-base font-bold tracking-wide', textVariantClasses[variant], textClassName)}>{children}</Text>
          ) : (
            children
          )}
          {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
