# pixels image scaler / spriter
# by chromakode and davean

import sys
import os
import os.path
import math
from os import listdir

paths = ["600px/black", "600px/white"]

for color in ["black", "white"]:
    p = os.path.join("600px", color)
    imgs = [(f, os.path.splitext(os.path.basename(f))) for f in [os.path.join(p, wf) for wf in listdir(p)] if os.path.isfile(f)]

    step = 1.5

    for (target, (fname, ext)) in imgs:
        outputs = []

        size = 600
        while size >= 1:
            scaled_name = "scaled/{fname}-{size}{ext}".format(
                fname=fname,
                size=size,
                ext=ext,
            )
            os.system("convert {target} -resize {size}x{size} -extent 600x600 {scaled_name}".format(
                target=target,
                size=size,
                scaled_name=scaled_name,
            ))
            outputs.append(scaled_name)
            size = int(step ** (math.ceil(math.log(size, step)) - 1))

        os.system("convert {outputs} +append scaled/{fname}-tiled{ext}".format(
            outputs=" ".join(outputs),
            fname=fname,
            ext=ext,
        ))

        for of in outputs:
            os.remove(of)
