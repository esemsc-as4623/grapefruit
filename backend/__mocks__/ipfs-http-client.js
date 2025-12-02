// Manual mock for ipfs-http-client (ESM package)
const mockIpfsClient = {
  add: jest.fn(),
  cat: jest.fn(),
  pin: {
    add: jest.fn()
  }
};

module.exports = {
  create: jest.fn(() => mockIpfsClient)
};
