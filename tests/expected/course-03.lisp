(setq a 0)
(setq b 5)
(setq c 2)
(setq d 0)

(defun main ()
  (format t "Hello world!~%")
  (setf a b)
  (setf d (truncate (* b c) 10))
  (format t "~d" d))

(main)
