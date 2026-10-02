export const maximumKeyPackageLifetime = 2628000n;

export function keyPackageLifetime(now = Date.now()) {
  const seconds = BigInt(Math.floor(now / 1000));
  const notBefore = seconds > 300n ? seconds - 300n : 0n;
  return { notBefore, notAfter: notBefore + maximumKeyPackageLifetime };
}

export function validateKeyPackageLifetime(keyPackage, now = Date.now()) {
  const leaf = keyPackage?.leafNode, lifetime = leaf?.lifetime;
  if (leaf?.leafNodeSource !== 'key_package' || typeof lifetime?.notBefore !== 'bigint'
    || typeof lifetime?.notAfter !== 'bigint' || lifetime.notBefore < 0n
    || lifetime.notAfter <= lifetime.notBefore
    || lifetime.notAfter - lifetime.notBefore > maximumKeyPackageLifetime) {
    throw new Error('key_package_lifetime_rejected');
  }
  const seconds = BigInt(Math.floor(now / 1000));
  if (seconds < lifetime.notBefore || seconds > lifetime.notAfter) throw new Error('key_package_expired');
  return true;
}
