function SendEmail() {}

SendEmail.prototype.retry = 2;
SendEmail.prototype.handle = function (args, p1, p2) {
  try {
    return new Promise((resolve, reject) => {
      console.log('hellooo', args, p1, p2);
      resolve(true);
    });
  } catch (e) {
    reject('rejected');
  }
};

// Queue.use({storage: AsyncStorage})
Queue.workers({ SendEmail });
Queue.deps({ SendEmail: ['hello', 'hello 2'] });

const queue = new Queue({
  storage: 'inmemory',
  prefix: 'sq_jobsx',
  timeout: 1000,
  limit: 1,
  principle: Queue.FIFO,
  debug: true,
});

queue.setLimit(-1);
// queue.setDebug(true);
queue.setPrefix('hello');

queue.on('email-sender:before', () => {
  console.log('test-3 beforeeee');
});

queue.on('email-sender:after', () => {
  console.log('test-3 after');
});

queue.on('email-sender:*', () => {
  console.log('test-3 wildcard');
});

queue.on('*', () => {
  console.log('wild card');
});

const channelA = queue.create('mailing');

setTimeout(async () => {
  await channelA.add({
    handler: 'SendEmail',
    tag: 'email-sender',
    args: { email: 'johndoe@example.com', fullname: 'John Doe 1' },
  });
  await channelA.add({
    handler: 'SendEmail',
    tag: 'email-sender',
    args: { email: 'johndoe@example.com', fullname: 'John Doe 2' },
  });
  await channelA.add({
    handler: 'SendEmail',
    tag: 'email-sender',
    args: { email: 'johndoe@example.com', fullname: 'John Doe 3' },
  });
  await channelA.add({
    handler: 'SendEmail',
    tag: 'email-sender',
    args: { email: 'johndoe@example.com', fullname: 'John Doe 4' },
  });
  await channelA.add({
    handler: 'SendEmail',
    tag: 'email-sender',
    args: { email: 'johndoe@example.com', fullname: 'John Doe 5' },
  });

  await channelA.start();
}, 1000);
// setTimeout(async () => {
// await channelA.add({
//   handler: 'SendEmail',
//   tag: 'email-sender',
//   args: {email: 'johndoe@example.com', fullname: 'John Doe 1'}
// });
// }, 1);

// setTimeout(async () => {
// await channelA.add({
//   handler: 'SendEmail',
//   args: {email: 'johndoe@example.com', fullname: 'John Doe 2'}
// });
// },2);

// setTimeout(async () => {
// await channelA.add({
//   handler: 'SendEmail',
//   args: {email: 'johndoe@example.com', fullname: 'John Doe 3'}
// });
// }, 3);

// setTimeout(async () => {
// await channelA.add({
//   handler: 'SendEmail',
//   args: {email: 'johndoe@example.com', fullname: 'John Doe 4'}
// });
// },4);

// setTimeout(async () => {
// await channelA.add({
//   handler: 'SendEmail',
//   args: {email: 'johndoe@example.com', fullname: 'John Doe 5'},
//   priority: 10
// });
// }, 5);
