export interface ClosableContext {
  close(): Promise<void>;
}

export interface PersistentContextDependencies<Context extends ClosableContext> {
  createUserDataDir(): Promise<string>;
  discoverExecutable(): string | undefined;
  launch(userDataDir: string, executablePath: string | undefined): Promise<Context>;
  removeUserDataDir(userDataDir: string): Promise<void>;
}

export async function withPersistentContext<Context extends ClosableContext>(
  dependencies: PersistentContextDependencies<Context>,
  use: (context: Context) => Promise<void>
): Promise<void> {
  let userDataDir: string | undefined;
  let context: Context | undefined;

  try {
    userDataDir = await dependencies.createUserDataDir();
    const executablePath = dependencies.discoverExecutable();
    context = await dependencies.launch(userDataDir, executablePath);
    await use(context);
  } finally {
    try {
      await context?.close();
    } finally {
      if (userDataDir !== undefined) {
        await dependencies.removeUserDataDir(userDataDir);
      }
    }
  }
}
