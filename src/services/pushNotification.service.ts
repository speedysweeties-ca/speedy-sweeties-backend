const savedCustomerTokens: string[] = [];

export function saveCustomerFcmToken(token: string): void {
  if (!savedCustomerTokens.includes(token)) {
    savedCustomerTokens.push(token);
  }
}
