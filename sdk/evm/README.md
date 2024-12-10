## Usage

### Instantiation

`Tbrv3.connect` is mostly useful for logic that needs to interact with a few specific chains. It'll only typecheck for the few chains where there is a functioning deployment.
This relies on a dictionary embedded in the library so if you find that a chain is not supported, try to upgrade the library.

On the other hand, `Tbrv3.connectUnknown` is useful when you want a "type stable" interface that is easy to extend to new chains when you want to do an early integration ahead of a suitable SDK release.