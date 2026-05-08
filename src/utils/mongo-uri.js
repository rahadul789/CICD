export function redactMongoUri(mongoUri) {
  try {
    const url = new URL(mongoUri);

    if (url.username) {
      url.username = '[redacted]';
    }

    if (url.password) {
      url.password = '[redacted]';
    }

    return url.toString();
  } catch {
    return 'mongodb://[redacted]';
  }
}
