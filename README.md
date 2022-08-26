# Chewie

Chewie is a handy bot for doing Colony things. It's built on Hubot and is very extensible!

## Development

To add a feature to Chewie, create a new file in the `scripts` directory. To learn more about how Hubot scripting works, check out [the docs](https://hubot.github.com/docs/scripting/). Testing is easy, just run:

```
yarn dev
yarn start-discord
```

For Discord, run
```
yarn start-discord
```


This will start a shell where you can talk to Chewie without having to hook it up to Slack! If you want any of the other scripts which require configuration to work, you'll need to set up your environment variables.

```
cp .env.example .env
```

The example file shows you all the configuration there is for Chewie. Set up what you need, and if you add any extra environment variables in your new script, please remember to add them to the example file (but not your actual keys!).
