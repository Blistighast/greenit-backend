// adds a loading delay
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export { sleep };
