import { ExecutorContext } from 'nx/src/config/misc-interfaces';
import { logger, runExecutor, Target } from '@nrwl/devkit';

process.on(
  'message',
  async (msg: {
    context: ExecutorContext;
    options: {
      target: string;
      parsedTarget: Target;
      targetOptions: any;
      supportsWatch: boolean;
      watch: boolean;
    };
  }) => {
    try {
      if (!msg.options || !msg.context) {
        throw new Error('Missing Executor Context and Options!');
      }

      const { options, context } = msg;
      logger.info(`NX Starting ${options.target}...`);
      for await (const output of await runExecutor(
        options.parsedTarget,
        options.supportsWatch ? { watch: options.watch } : {},
        context
      )) {
        if (!output.success && !options.watch)
          throw new Error(`Could not start dev server ${options.parsedTarget}`);
        process.send(output);
      }
    } catch (e) {
      process.send({ error: e });
      logger.error(`NX unable to run dev server!`);
      logger.error(e);
      process.exit(1);
    }
  }
);
